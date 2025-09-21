import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as go from 'gojs/release/go-module.js'; // ESM: evita que contamine window.go
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { DiagramService } from '../../../../core/diagram/diagram.service';
import { DiagramPostParams } from '../../../../core/interfaces/diagram';
import { debounceTime, Subject } from 'rxjs';

interface DiagramNode {
  key: number;
  name: string;
  attributes: Attribute[];
  methods: Method[];
  loc?: string;
  size?: string;
  userSized?: boolean;
}

interface Attribute {
  name: string;
  type: string;
  primaryKey: boolean;
  foreignKey: boolean;
}

interface Method {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
}

interface DiagramLink {
  key?: number;
  from: number;
  to: number;
  relationship: string;
  fromMult?: string;
  toMult?: string;
  styleScale?: number;
}

@Component({
  selector: 'app-diagram-editor',
  standalone: false,
  templateUrl: './diagram-editor.component.html',
  styleUrls: ['./diagram-editor.component.css']
})
export class DiagramEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramRef!: ElementRef;

  // Configuración
  private baseURL = 'http://localhost:3000/api'; // ajusta según tu backend
  private sessionId!: number;
  private userId!: number;
  private token = '';
  private clientId = this.generateClientId();

  // GoJS
  private diagram!: go.Diagram;
  private idCounter = 1;
  private linkCounter = 1;

  // Estado del componente
  selectedEntity: go.Node | null = null;
  selectedLink: go.Link | null = null;
  diagramExists = false;   // <- define create vs update
  hasChanges = false;
  isExporting = false;
  resizeMode = false;

  // Relaciones
  isCreatingRelation = false;
  relationMode = '';
  selectedRelationship: string | null = null;

  // Modal de edición
  showModal = false;
  entityName = '';
  attributes: Attribute[] = [];
  methods: Method[] = [];
  newAttribute: Attribute = { name: '', type: 'int', primaryKey: false, foreignKey: false };
  newMethod: Method = { name: '', type: 'void', visibility: 'public' };

  // WebSocket
  private stompClient!: Client;
  private isProcessing = false;

  // Persistencia con debounce para no spamear el backend
  private persist$ = new Subject<void>();

  private $ = go.GraphObject.make;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private diagramService: DiagramService
  ) {}

  ngOnInit(): void {
    // Ruta: /session/:id/diagram/:idSession
    this.sessionId = Number(this.route.snapshot.paramMap.get('idSession'));
    this.userId = Number(this.route.snapshot.paramMap.get('id'));
    this.token = localStorage.getItem('auth_token') || '';

    // Debounce para actualizaciones frecuentes (mover nodos, etc.)
    this.persist$.pipe(debounceTime(400)).subscribe(() => {
      this.persistDiagram();
    });
  }

  ngAfterViewInit(): void {
    this.initDiagram();
    this.loadDiagram();
    this.connectToWebSocket();
  }

  async ngOnDestroy(): Promise<void> {
    if (this.stompClient) {
      try { await this.stompClient.deactivate(); } catch {}
    }
    if (this.diagram) this.diagram.div = null;
  }

  private generateClientId(): string {
    // @ts-ignore
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `c_${Date.now()}_${Math.random()}`;
  }

  // ===== INICIALIZACIÓN GOJS =====
  private initDiagram(): void {
    const $ = this.$;

    this.diagram = $(go.Diagram, this.diagramRef.nativeElement, {
      'undoManager.isEnabled': true,
      model: $(go.GraphLinksModel, { linkKeyProperty: 'key' }),
      'linkingTool.archetypeLinkData': {
        relationship: 'OneToOne',
        fromMult: '1',
        toMult: '1',
        styleScale: 1.6,
        key: undefined
      }
    });

    this.setupDiagramListeners();
    this.setupNodeTemplate();
    this.setupLinkTemplate();
  }

  private setupDiagramListeners(): void {
    // Cambios en el modelo -> broadcast y persist
    this.diagram.model.addChangedListener((e: go.ChangedEvent) => {
      if (!e.isTransactionFinished) return;
      this.hasChanges = true;
      this.isProcessing = true;
      this.sendDiagramUpdate('fullDiagram', { data: JSON.parse(this.diagram.model.toJson()) });

      // Si ya existe, actualiza con debounce
      if (this.diagramExists) this.persist$.next();
    });

    // Redimensionamiento de nodos
    this.diagram.addDiagramListener('PartResized', (e: go.DiagramEvent) => {
      const part = e.subject.part;
      if (!(part instanceof go.Node)) return;
      this.diagram.startTransaction('UserSized');
      this.diagram.model.setDataProperty(part.data, 'userSized', true);
      this.diagram.commitTransaction('UserSized');
      this.sendDiagramUpdate('updateNode', { nodeData: { ...part.data } });
      if (this.diagramExists) this.persist$.next();
    });

    // Movimiento de nodos
    this.diagram.addDiagramListener('SelectionMoved', (e: go.DiagramEvent) => {
      e.subject.each((part: go.Part) => {
        if (part instanceof go.Node) {
          const updatedNode = {
            key: part.data.key,
            loc: `${part.location.x} ${part.location.y}`
          };
          this.sendDiagramUpdate('nodePosition', { nodeData: updatedNode });
        }
      });
      if (this.diagramExists) this.persist$.next();
    });

    // Creación de enlaces
    this.diagram.addDiagramListener('LinkDrawn', (e: go.DiagramEvent) => {
      const link = e.subject as go.Link;
      if (!link) return;

      const type = this.relationMode || (link.data && link.data.relationship) || 'OneToOne';
      if (type === 'ManyToMany') {
        this.handleManyToManyRelation(link.data);
        if (this.isCreatingRelation) this.deactivateRelationMode();
        return;
      }

      const patched = this.setupLinkByRelationType(link.data, type);
      if (patched) {
        this.ensureLinkMultiplicities(patched);
        this.diagram.startTransaction('Patch Link Type');
        Object.entries(patched).forEach(([k, v]) => {
          if (k !== 'key') this.diagram.model.setDataProperty(link.data, k, v);
        });
        this.diagram.commitTransaction('Patch Link Type');
        this.sendDiagramUpdate('newLink', { linkData: link.data });
      }
      if (this.isCreatingRelation) this.deactivateRelationMode();
      link.isSelected = true;

      if (this.diagramExists) this.persist$.next();
    });
  }

  private setupNodeTemplate(): void {
    const $ = this.$;

    const FONT_BASE = '13px sans-serif';
    const FONT_HEADER = 'bold 16px sans-serif';
    const NODE_MIN_W = 240;
    const NODE_MIN_H = 120;

    this.diagram.nodeTemplate = $(
      go.Node,
      'Auto',
      {
        selectionChanged: (part: go.Part) => {
          const node = part as go.Node;
          this.onNodeSelected(node);
          this.showPorts(node, node.isSelected || this.isCreatingRelation);
        },
        locationSpot: go.Spot.Center,
        resizable: this.resizeMode,
        resizeObjectName: 'SHAPE',
        mouseEnter: (_e: go.InputEvent, obj: go.GraphObject) => {
          const node = obj.part as go.Node;
          if (node && this.isCreatingRelation) this.showPorts(node, true);
        },
        mouseLeave: (_e: go.InputEvent, obj: go.GraphObject) => {
          const node = obj.part as go.Node;
          const keep = (node?.isSelected ?? false) || this.isCreatingRelation;
          if (node) this.showPorts(node, keep);
        }
      },
      new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),

      $(go.Shape, 'RoundedRectangle', {
        name: 'SHAPE',
        fill: 'lightblue',
        stroke: 'black',
        strokeWidth: 2,
        minSize: new go.Size(NODE_MIN_W, NODE_MIN_H)
      }),
      new go.Binding('desiredSize', 'size', (s?: string) => {
        if (!s) return undefined;
        const [w, h] = (s || `${NODE_MIN_W} ${NODE_MIN_H}`).split(' ').map(Number);
        return new go.Size(w, h);
      }).makeTwoWay((sz?: go.Size) => (sz ? `${Math.round(sz.width)} ${Math.round(sz.height)}` : undefined)),

      $(
        go.Panel,
        'Vertical',
        { margin: 12, defaultAlignment: go.Spot.Left },

        // Título
        $(
          go.TextBlock,
          {
            margin: new go.Margin(4, 4, 8, 4),
            font: FONT_HEADER,
            stroke: '#333',
            textAlign: 'center',
            wrap: go.TextBlock.WrapFit
          },
          new go.Binding('text', 'name')
        ),

        // Línea
        $(go.Shape, 'LineH', {
          stroke: 'black',
          strokeWidth: 1,
          height: 1,
          stretch: go.GraphObject.Horizontal,
          margin: new go.Margin(0, 4, 4, 4)
        }),

        // Atributos
        $(
          go.Panel, 'Vertical',
          { stretch: go.GraphObject.Horizontal, defaultAlignment: go.Spot.Left },
          new go.Binding('itemArray', 'attributes'),
          {
            itemTemplate: $(
              go.Panel, 'Horizontal',
              { margin: new go.Margin(1, 4, 1, 8), stretch: go.GraphObject.Horizontal },
              $(
                go.TextBlock,
                {
                  font: FONT_BASE,
                  stroke: '#333',
                  textAlign: 'left',
                  wrap: go.TextBlock.WrapFit
                },
                new go.Binding('text', '', (attr: Attribute) => {
                  const pk = attr.primaryKey ? ' [PK]' : '';
                  const fk = attr.foreignKey ? ' [FK]' : '';
                  return `${attr.name}: ${attr.type}${pk}${fk}`;
                })
              )
            )
          }
        ),

        // Línea métodos (si hay)
        $(
          go.Shape, 'LineH',
          {
            stroke: 'black',
            strokeWidth: 1,
            height: 1,
            stretch: go.GraphObject.Horizontal,
            margin: new go.Margin(4, 4, 4, 4)
          },
          new go.Binding('visible', 'methods', (m: Method[]) => Array.isArray(m) && m.length > 0)
        ),

        // Métodos
        $(
          go.Panel, 'Vertical',
          { stretch: go.GraphObject.Horizontal, defaultAlignment: go.Spot.Left },
          new go.Binding('itemArray', 'methods'),
          {
            itemTemplate: $(
              go.Panel, 'Horizontal',
              { margin: new go.Margin(1, 4, 1, 8), stretch: go.GraphObject.Horizontal },
              $(
                go.TextBlock,
                {
                  font: FONT_BASE,
                  stroke: '#333',
                  textAlign: 'left',
                  wrap: go.TextBlock.WrapFit
                },
                new go.Binding('text', '', (m: Method) => `${m.visibility} ${m.name}(): ${m.type}`)
              )
            )
          }
        )
      ),

      // Puertos
      this.makePort('T', go.Spot.Top),
      this.makePort('L', go.Spot.Left),
      this.makePort('R', go.Spot.Right),
      this.makePort('B', go.Spot.Bottom)
    );
  }

  private setupLinkTemplate(): void {
    const $ = this.$;
    const LINK_STROKE = 3;
    const LABEL_FONT = 'bold 13px sans-serif';
    const LABEL_BG = 'white';
    const ARROW_SCALE = 1.6;

    this.diagram.linkTemplate = $(
      go.Link,
      {
        routing: go.Routing.AvoidsNodes,
        curve: go.Curve.JumpOver,
        corner: 8,
        relinkableFrom: true,
        relinkableTo: true,
        selectable: true,
        deletable: true,
        selectionChanged: (part: go.Part) => this.onLinkSelected(part as go.Link)
      },

      $(go.Shape, { isPanelMain: true, strokeWidth: LINK_STROKE },
        new go.Binding('strokeDashArray', 'relationship', this.getDashArray)
      ),

      $(go.Shape,
        new go.Binding('toArrow', 'relationship', this.getArrowType),
        { stroke: 'black', fill: 'black' },
        new go.Binding('scale', 'styleScale', (s?: number) => s || ARROW_SCALE)
      ),

      $(go.Shape,
        new go.Binding('fromArrow', 'relationship', this.getFromArrow),
        new go.Binding('fill', 'relationship', this.getFromArrowFill),
        { stroke: 'black' },
        new go.Binding('scale', 'styleScale', (s?: number) => s || ARROW_SCALE)
      ),

      // Mult "from"
      $(go.TextBlock,
        {
          segmentIndex: 0,
          segmentOffset: new go.Point(0, -20),
          font: LABEL_FONT,
          background: LABEL_BG,
          margin: 2,
          stroke: '#111'
        },
        new go.Binding('visible', '', (d: any) => this.showMultLabel(d)),
        new go.Binding('text', 'fromMult', (t?: string) => t || '1')
      ),

      // Mult "to"
      $(go.TextBlock,
        {
          segmentIndex: -1,
          segmentOffset: new go.Point(0, -20),
          font: LABEL_FONT,
          background: LABEL_BG,
          margin: 2,
          stroke: '#111'
        },
        new go.Binding('visible', '', (d: any) => this.showMultLabel(d)),
        new go.Binding('text', 'toMult', (t?: string) => t || '1')
      )
    );
  }

  // ===== AUXILIARES GOJS =====
  private makePort(name: string, spot: go.Spot): go.GraphObject {
    const $ = this.$;
    return $(go.Shape, 'Circle', {
      fill: '#007bff',
      stroke: 'white',
      strokeWidth: 2,
      desiredSize: new go.Size(10, 10),
      portId: name,
      fromSpot: spot,
      toSpot: spot,
      fromLinkable: true,
      toLinkable: true,
      cursor: 'pointer',
      alignment: spot,
      visible: false
    });
  }

  private showPorts(node: go.Node, show: boolean): void {
    if (!node || !node.ports) return;
    node.ports.each((p: go.GraphObject) => (p.visible = !!show));
  }

  private showMultLabel(data: any): boolean {
    return data && (data.relationship === 'OneToOne' || data.relationship === 'OneToMany');
  }

  private ensureLinkMultiplicities(l: any): void {
    if (!l) return;
    if (l.relationship === 'OneToOne') {
      l.fromMult = l.fromMult || '1';
      l.toMult = l.toMult || '1';
    } else if (l.relationship === 'OneToMany') {
      l.fromMult = l.fromMult || '1';
      l.toMult = l.toMult || '*';
    } else {
      delete l.fromMult;
      delete l.toMult;
    }
    if (typeof l.styleScale === 'undefined') l.styleScale = 1.6;
  }

  private setupLinkByRelationType(linkData: any, relationType: string): any {
    const updated = { ...linkData };
    switch (relationType) {
      case 'OneToOne':
        updated.relationship = 'OneToOne';
        updated.fromMult = '1';
        updated.toMult = '1';
        break;
      case 'OneToMany':
        updated.relationship = 'OneToMany';
        updated.fromMult = '1';
        updated.toMult = '*';
        break;
      case 'ManyToMany':
        this.handleManyToManyRelation(linkData);
        return null;
      case 'Generalizacion':
      case 'Agregacion':
      case 'Composicion':
      case 'Recursividad':
      case 'Dependencia':
        updated.relationship = relationType;
        delete updated.fromMult;
        delete updated.toMult;
        break;
      default:
        updated.relationship = 'OneToOne';
        updated.fromMult = '1';
        updated.toMult = '1';
    }
    updated.styleScale = updated.styleScale || 1.6;
    updated.key = updated.key ?? this.linkCounter++;
    return updated;
  }

  private handleManyToManyRelation(linkData: any): void {
    this.diagram.startTransaction('ManyToMany');

    const model = this.diagram.model as go.GraphLinksModel;
    model.removeLinkData(linkData);

    const a = this.diagram.findNodeForKey(linkData.from);
    const b = this.diagram.findNodeForKey(linkData.to);
    if (!a || !b) {
      this.diagram.commitTransaction('ManyToMany');
      return;
    }

    const midX = (a.location.x + b.location.x) / 2;
    const midY = (a.location.y + b.location.y) / 2;

    const interNode: DiagramNode = {
      key: this.idCounter++,
      name: `${a.data.name}_${b.data.name}`,
      attributes: [],
      methods: [],
      loc: `${midX} ${midY}`,
      userSized: false
    };
    model.addNodeData(interNode);

    const l1: DiagramLink = {
      from: a.data.key,
      to: interNode.key,
      relationship: 'OneToMany',
      fromMult: '1',
      toMult: '*',
      styleScale: 1.6,
      key: this.linkCounter++
    };
    const l2: DiagramLink = {
      from: b.data.key,
      to: interNode.key,
      relationship: 'OneToMany',
      fromMult: '1',
      toMult: '*',
      styleScale: 1.6,
      key: this.linkCounter++
    };

    model.addLinkData(l1);
    model.addLinkData(l2);
    this.diagram.commitTransaction('ManyToMany');

    this.sendDiagramUpdate('newNode', { nodeData: interNode });
    this.sendDiagramUpdate('newLink', { linkData: l1 });
    this.sendDiagramUpdate('newLink', { linkData: l2 });

    if (this.diagramExists) this.persist$.next();
  }

  // Apariencia de enlaces
  private getArrowType = (rel: string) => rel === 'Generalizacion' ? 'OpenTriangle' : '';
  private getFromArrow = (rel: string) => (rel === 'Agregacion' || rel === 'Composicion') ? 'Diamond' : '';
  private getFromArrowFill = (rel: string) => (rel === 'Composicion') ? 'black' : (rel === 'Agregacion' ? 'white' : null);
  private getDashArray = (rel: string) => rel === 'Dependencia' ? [4, 2] : null;

  // ===== ACCIONES UI =====
  addEntity(): void {
    const model = this.diagram.model as go.GraphLinksModel;

    this.diagram.startTransaction('Add Entity');
    const newNode: DiagramNode = {
      key: this.idCounter++,
      name: 'Nueva Entidad',
      attributes: [],
      methods: [],
      loc: '0 0',
      userSized: false
    };
    model.addNodeData(newNode);
    this.diagram.commitTransaction('Add Entity');

    this.sendDiagramUpdate('newNode', { nodeData: newNode });

    // Si no existe aún en backend -> crea, si ya existe -> update
    if (!this.diagramExists) {
      this.persistDiagram(true); // fuerza create
    } else {
      this.persist$.next();      // update con debounce
    }
  }

  deleteSelected(): void {
    this.diagram.commandHandler.deleteSelection();
    if (this.diagramExists) this.persist$.next();
  }

  openEditDialog(): void {
    if (!this.selectedEntity) return;
    this.entityName = this.selectedEntity.data.name;
    this.attributes = Array.isArray(this.selectedEntity.data.attributes) ? [...this.selectedEntity.data.attributes] : [];
    this.methods = Array.isArray(this.selectedEntity.data.methods) ? [...this.selectedEntity.data.methods] : [];
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveEntity(): void {
    if (!this.selectedEntity) return;
    this.isProcessing = true;

    this.diagram.startTransaction('Update Entity');
    if (!this.selectedEntity.data.userSized) {
      this.diagram.model.setDataProperty(this.selectedEntity.data, 'size', undefined);
    }
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'name', this.entityName);
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'attributes', [...this.attributes]);
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'methods', [...this.methods]);
    this.diagram.commitTransaction('Update Entity');

    const updatedEntity = { ...this.selectedEntity.data };
    this.sendDiagramUpdate('updateNode', { nodeData: updatedEntity });
    this.closeModal();

    if (this.diagramExists) this.persist$.next();
  }

  // Atributos
  addAttribute(): void {
    if (this.newAttribute.name && this.newAttribute.type) {
      this.attributes.push({ ...this.newAttribute });
      this.newAttribute = { name: '', type: 'int', primaryKey: false, foreignKey: false };
    }
  }
  removeAttribute(index: number): void { this.attributes.splice(index, 1); }
  togglePrimaryKey(): void { this.newAttribute.primaryKey = !this.newAttribute.primaryKey; }
  toggleForeignKey(): void { this.newAttribute.foreignKey = !this.newAttribute.foreignKey; }

  // Métodos
  addMethod(): void {
    if (this.newMethod.name) {
      this.methods.push({ ...this.newMethod });
      this.newMethod = { name: '', type: 'void', visibility: 'public' };
    }
  }
  removeMethod(index: number): void { this.methods.splice(index, 1); }

  // ===== RELACIONES =====
  selectRelationship(type: string): void {
    this.relationMode = type;
    this.isCreatingRelation = true;
    this.selectedRelationship = type;

    const archetype = this.setupLinkArchetype(type);
    if (archetype && this.diagram?.toolManager?.linkingTool) {
      this.diagram.toolManager.linkingTool.archetypeLinkData = archetype;
    }
    if (this.diagram?.div) this.diagram.div.style.cursor = 'crosshair';
  }

  private setupLinkArchetype(type: string): any {
    const base = { key: undefined, styleScale: 1.6 };
    const map: { [key: string]: any } = {
      OneToOne: { relationship: 'OneToOne', fromMult: '1', toMult: '1' },
      OneToMany: { relationship: 'OneToMany', fromMult: '1', toMult: '*' },
      ManyToMany: { relationship: 'ManyToMany' },
      Generalizacion: { relationship: 'Generalizacion' },
      Agregacion: { relationship: 'Agregacion' },
      Composicion: { relationship: 'Composicion' },
      Recursividad: { relationship: 'Recursividad' },
      Dependencia: { relationship: 'Dependencia' }
    };
    return { ...base, ...(map[type] || map['OneToOne']) };
  }

  deactivateRelationMode(): void {
    this.isCreatingRelation = false;
    this.relationMode = '';
    this.selectedRelationship = null;
    if (this.diagram?.div) this.diagram.div.style.cursor = 'default';
    if (this.diagram) {
      this.diagram.nodes.each((node: go.Node) => {
        const keep = node.isSelected;
        this.showPorts(node, keep);
      });
    }
  }

  // ===== WEBSOCKET =====
  private connectToWebSocket(): void {
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(`${this.baseURL}/ws-diagram`),
      reconnectDelay: 5000,
      onConnect: () => {
        if (!this.sessionId) return;
        this.stompClient.subscribe(`/topic/diagrams/${this.sessionId}`, (message: IMessage) => {
          const updated = JSON.parse(message.body);
          if (!updated) return;
          if (updated.clientId && updated.clientId === this.clientId) return; // ignora tu propio eco
          if (this.isProcessing) { this.isProcessing = false; return; }
          this.handleWebSocketUpdate(updated);
        });
      },
      onStompError: (err) => console.error('Error WS:', err)
    });

    this.stompClient.activate();
  }

  private sendDiagramUpdate(eventType: string, data: any): void {
    if (!this.stompClient || !this.stompClient.connected) return;
    const payload = { clientId: this.clientId, eventType, ...data };
    this.stompClient.publish({
      destination: `/app/updateDiagram/${this.sessionId}`,
      body: JSON.stringify(payload)
    });
  }

  private handleWebSocketUpdate(updated: any): void {
    const model = this.diagram.model as go.GraphLinksModel;

    switch (updated.eventType) {
      case 'fullDiagram': {
        const obj = updated.data;
        if (obj?.nodeDataArray && obj?.linkDataArray) {
          this.diagram.model = go.Model.fromJson(obj) as go.GraphLinksModel;
          (this.diagram.model as go.GraphLinksModel).linkKeyProperty = 'key';
        }
        break;
      }
      case 'newNode': {
        model.addNodeData(updated.nodeData);
        break;
      }
      case 'updateNode': {
        const nd = updated.nodeData;
        const it = model.findNodeDataForKey(nd.key);
        if (it) Object.keys(nd).forEach(k => k !== 'key' && model.setDataProperty(it, k, (nd as any)[k]));
        break;
      }
      case 'newLink': {
        model.addLinkData(updated.linkData);
        break;
      }
      case 'nodePosition': {
        const nd = updated.nodeData;
        const it = model.findNodeDataForKey(nd.key);
        if (it) model.setDataProperty(it, 'loc', nd.loc);
        break;
      }
      default:
        // otros tipos a futuro
        break;
    }
  }

  // ===== PERSISTENCIA (create vs update) =====
  private currentModelAsObject(): object {
    try {
      return JSON.parse(this.diagram.model.toJson());
    } catch {
      return { class: 'GraphLinksModel', nodeDataArray: [], linkDataArray: [], linkKeyProperty: 'key' };
    }
  }

  // wrapper para tu HTML (btn "Guardar Diagrama")
  public updateDiagram(): void {
    this.persistDiagram();
  }

  private persistDiagram(forceCreate = false): void {
    const dataObj = this.currentModelAsObject();

    // Si tu backend envuelve en data, lo mandamos así:
    const payload: DiagramPostParams = {
      sessionId: this.sessionId,
      data: dataObj
    };

    if (forceCreate || !this.diagramExists) {
      this.diagramService.createDiagram(payload).subscribe({
        next: () => { this.diagramExists = true; },
        error: (err) => console.error('Error al crear diagrama:', err)
      });
    } else {
      this.diagramService.updateDiagram(payload).subscribe({
        error: (err) => console.error('Error al actualizar diagrama:', err)
      });
    }
  }

  private loadDiagram(): void {
    this.diagramService.getDiagramBySession(this.sessionId).subscribe({
      next: (raw: any) => {
        // El backend a veces retorna { data: {...} }
        const wrapper = raw?.data ?? raw;
        const modelObj = typeof wrapper === 'string' ? JSON.parse(wrapper) : wrapper;

        if (modelObj?.data?.nodeDataArray || modelObj?.nodeDataArray) {
          const m = modelObj?.data ?? modelObj;
          this.diagram.model = go.Model.fromJson(m) as go.GraphLinksModel;
          (this.diagram.model as go.GraphLinksModel).linkKeyProperty = 'key';

          const nodes = (this.diagram.model as go.GraphLinksModel).nodeDataArray as any[];
          const links = (this.diagram.model as go.GraphLinksModel).linkDataArray as any[];
          this.idCounter = (nodes?.reduce((max, n) => Math.max(max, Number(n.key) || 0), 0) || 0) + 1;
          this.linkCounter = (links?.reduce((max, l) => Math.max(max, Number(l.key) || 0), 0) || 0) + 1;

          this.diagramExists = true;
        } else {
          // No había diagrama
          this.diagramExists = false;
        }
      },
      error: (err) => {
        console.error('getDiagramBySession error:', err);
        // fallback: deja crear al primer cambio
        this.diagramExists = false;
      }
    });
  }

  // ===== SELECCIÓN / UI =====
  private onNodeSelected(node: go.Node): void {
    if (node.isSelected) {
      this.selectedEntity = node;
      const shape = node.findObject('SHAPE') as go.Shape | null;
      if (shape) { shape.stroke = '#4CAF50'; shape.strokeWidth = 2; }
    } else {
      this.selectedEntity = null;
      const shape = node.findObject('SHAPE') as go.Shape | null;
      if (shape) { shape.stroke = 'black'; shape.strokeWidth = 2; }
    }
  }

  private onLinkSelected(link: go.Link): void {
    this.selectedLink = link.isSelected ? link : null;
  }

  // ===== NAVEGACIÓN =====
  goBack(): void {
    if (window.history.length > 1) {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/sessions']);
    }
  }

  toggleResizeMode(): void {
    this.resizeMode = !this.resizeMode;
    if (!this.diagram) return;
    this.diagram.startTransaction('Toggle Resizable');
    this.diagram.nodes.each((node: go.Node) => (node.resizable = this.resizeMode));
    this.diagram.commitTransaction('Toggle Resizable');
    if (this.diagramExists) this.persist$.next();
  }
}

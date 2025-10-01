import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

// GoJS (ESM)
import * as go from 'gojs/release/go-module.js';

// STOMP
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

// Servicio propio
import { DiagramService } from '../../../../core/diagram/diagram.service';
import { DiagramPostParams } from '../../../../core/interfaces/diagram';

// RxJS
import { Subject, debounceTime } from 'rxjs';

// Reactive Forms
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';

/* =======================
 *   Tipos / Interfaces
 * ======================= */
interface AiMessage {
  role: 'user' | 'ai';
  text: string;
  suggestions?: string[];
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
interface DiagramNode {
  key: number;
  name: string;
  attributes: Attribute[];
  methods: Method[];
  loc?: string;
  size?: string;
  userSized?: boolean;
}
interface DiagramLink {
  key?: number;
  from: number;
  to: number;
  relationship: string;
  fromMult?: string; // canonical: '1' | '*'
  toMult?: string;   // en la UI mostramos '1' | '1..*'
  styleScale?: number;
}

/* ======================================================
 *               COMPONENTE COMPLETO
 * ====================================================== */
@Component({
  selector: 'app-diagram-editor',
  standalone: false,
  templateUrl: './diagram-editor.component.html',
  styleUrls: ['./diagram-editor.component.css'],
})
export class DiagramEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramRef!: ElementRef<HTMLDivElement>;
  @ViewChild('aiScroll', { static: false }) aiScroll?: ElementRef<HTMLDivElement>;

  /* ===== Chat IA ===== */
  aiOpen = false;
  aiPrompt = '';
  aiLoading = false;
  aiMessages: AiMessage[] = [];

  /* ===== Config ===== */
  private baseURL = 'https://back-alpire-8o9uk.ondigitalocean.app/api';
  private sessionId!: number;
  private userId!: number;
  private token = '';
  private clientId = this.generateClientId();
  private isExport = false;

  /* ===== GoJS ===== */
  private diagram!: go.Diagram;
  private idCounter = 1;
  private linkCounter = 1;
  private $ = go.GraphObject.make;

  /* ===== Estado UI ===== */
  sidebarOpen = false;
  selectedEntity: go.Node | null = null;
  selectedLink: go.Link | null = null;
  diagramExists = false;
  hasChanges = false;
  isExporting = false;

  /* ===== Modos ===== */
  resizeMode = false;
  isCreatingRelation = false;
  relationMode:
    | ''
    | 'OneToOne'
    | 'OneToMany'
    | 'ManyToMany'
    | 'Generalizacion'
    | 'Agregacion'
    | 'Composicion'
    | 'Recursividad'
    | 'Dependencia' = '';
  selectedRelationship: string | null = null;

  /* ===== WebSocket ===== */
  private stompClient!: Client;
  private isProcessing = false;

  /* ===== Persistencia ===== */
  private persist$ = new Subject<void>();

  /* ===== Modal (reactive forms) ===== */
  showModal = false;
  entityForm!: FormGroup;
  newAttributeForm!: FormGroup;
  newMethodForm!: FormGroup;

  // Catálogos
  attributeTypes = ['int', 'varchar', 'datetime', 'boolean', 'char', 'decimal', 'text'];
  methodReturnTypes = ['void', 'boolean', 'int', 'String', 'double', 'Object'];
  methodVisibilities: Array<'public' | 'private' | 'protected'> = ['public', 'private', 'protected'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private diagramService: DiagramService,
    private fb: FormBuilder
  ) {}

  /* =======================
   *   Ciclo de vida
   * ======================= */
  ngOnInit(): void {
    this.sessionId = Number(this.route.snapshot.paramMap.get('idSession'));
    this.userId = Number(this.route.snapshot.paramMap.get('id'));
    this.token = localStorage.getItem('auth_token') || '';

    // Persistencia con debounce
    this.persist$.pipe(debounceTime(400)).subscribe(() => this.persistDiagram());

    // Formularios
    this.entityForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      attributes: this.fb.array([]),
      methods: this.fb.array([]),
    });

    this.newAttributeForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      type: ['', Validators.required],
      primaryKey: [false],
      foreignKey: [false],
    });

    this.newMethodForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      type: ['void', Validators.required],
      visibility: ['public', Validators.required],
    });
  }

  ngAfterViewInit(): void {
    this.initDiagram();
    this.loadDiagram();
    this.connectToWebSocket();
  }

  async ngOnDestroy(): Promise<void> {
    try {
      if (this.stompClient) await this.stompClient.deactivate();
    } catch {}
    if (this.diagram) this.diagram.div = null;
  }

  /* =======================
   *   Helpers / Getters
   * ======================= */
  private generateClientId(): string {
    // @ts-ignore
    return (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `c_${Date.now()}_${Math.random()}`;
  }

  get attributesFA(): FormArray<FormGroup> {
    return this.entityForm.get('attributes') as FormArray<FormGroup>;
  }
  get methodsFA(): FormArray<FormGroup> {
    return this.entityForm.get('methods') as FormArray<FormGroup>;
  }

  private buildAttributeFG(a: Attribute): FormGroup {
    return this.fb.group({
      name: new FormControl(a.name, [Validators.required, Validators.maxLength(80)]),
      type: new FormControl(a.type, Validators.required),
      primaryKey: new FormControl(a.primaryKey),
      foreignKey: new FormControl(a.foreignKey),
    });
  }

  private buildMethodFG(m: Method): FormGroup {
    return this.fb.group({
      name: new FormControl(m.name, [Validators.required, Validators.maxLength(80)]),
      type: new FormControl(m.type, Validators.required),
      visibility: new FormControl(m.visibility, Validators.required),
    });
  }

  asFormGroup(ctrl: AbstractControl): FormGroup {
    return ctrl as FormGroup;
  }

  /* =======================
   *   Inicialización GoJS
   * ======================= */
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
        key: undefined,
      },
    });

    this.setupDiagramListeners();
    this.setupNodeTemplate();
    this.setupLinkTemplate();
  }

  private setupDiagramListeners(): void {
    // Cambios en el modelo
    this.diagram.model.addChangedListener((e: go.ChangedEvent) => {
      if (!e.isTransactionFinished) return;
      this.hasChanges = true;
      this.isProcessing = true;

      this.sendDiagramUpdate('fullDiagram', {
        data: JSON.parse(this.diagram.model.toJson()),
      });

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
            loc: `${part.location.x} ${part.location.y}`,
          };
          this.sendDiagramUpdate('nodePosition', { nodeData: updatedNode });
        }
      });
      if (this.diagramExists) this.persist$.next();
    });

    // Link creado
    this.diagram.addDiagramListener('LinkDrawn', (e: go.DiagramEvent) => {
      const link = e.subject as go.Link;
      if (!link) return;

      const type =
        this.relationMode || (link.data && link.data.relationship) || 'OneToOne';

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
        },
      },
      new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(
        go.Point.stringify
      ),

      $(go.Shape, 'RoundedRectangle', {
        name: 'SHAPE',
        fill: '#9E9E9E',
        stroke: '#424242',
        strokeWidth: 2,
        minSize: new go.Size(NODE_MIN_W, NODE_MIN_H),
      }),
      new go.Binding('desiredSize', 'size', (s?: string) => {
        if (!s) return undefined;
        const [w, h] = (s || `${NODE_MIN_W} ${NODE_MIN_H}`).split(' ').map(Number);
        return new go.Size(w, h);
      }).makeTwoWay((sz?: go.Size) =>
        sz ? `${Math.round(sz.width)} ${Math.round(sz.height)}` : undefined
      ),

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
            wrap: go.TextBlock.WrapFit,
          },
          new go.Binding('text', 'name')
        ),

        // Línea
        $(go.Shape, 'LineH', {
          stroke: 'black',
          strokeWidth: 1,
          height: 1,
          stretch: go.GraphObject.Horizontal,
          margin: new go.Margin(0, 4, 4, 4),
        }),

        // Atributos
        $(
          go.Panel,
          'Vertical',
          { stretch: go.GraphObject.Horizontal, defaultAlignment: go.Spot.Left },
          new go.Binding('itemArray', 'attributes'),
          {
            itemTemplate: $(
              go.Panel,
              'Horizontal',
              { margin: new go.Margin(1, 4, 1, 8), stretch: go.GraphObject.Horizontal },
              $(
                go.TextBlock,
                {
                  font: FONT_BASE,
                  stroke: '#333',
                  textAlign: 'left',
                  wrap: go.TextBlock.WrapFit,
                },
                new go.Binding('text', '', (attr: Attribute) => {
                  const pk = attr.primaryKey ? ' [PK]' : '';
                  const fk = attr.foreignKey ? ' [FK]' : '';
                  return `${attr.name}: ${attr.type}${pk}${fk}`;
                })
              )
            ),
          }
        ),

        // Línea métodos
        $(
          go.Shape,
          'LineH',
          {
            stroke: 'black',
            strokeWidth: 1,
            height: 1,
            stretch: go.GraphObject.Horizontal,
            margin: new go.Margin(4, 4, 4, 4),
          },
          new go.Binding('visible', 'methods', (m: Method[]) => Array.isArray(m) && m.length > 0)
        ),

        // Métodos
        $(
          go.Panel,
          'Vertical',
          { stretch: go.GraphObject.Horizontal, defaultAlignment: go.Spot.Left },
          new go.Binding('itemArray', 'methods'),
          {
            itemTemplate: $(
              go.Panel,
              'Horizontal',
              { margin: new go.Margin(1, 4, 1, 8), stretch: go.GraphObject.Horizontal },
              $(
                go.TextBlock,
                {
                  font: FONT_BASE,
                  stroke: '#333',
                  textAlign: 'left',
                  wrap: go.TextBlock.WrapFit,
                },
                new go.Binding('text', '', (m: Method) => `${m.visibility} ${m.name}(): ${m.type}`)
              )
            ),
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
  const ARROW_SCALE = 1.6;
  const LABEL_FONT = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const MULT_FONT  = '1000 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

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
      selectionChanged: (part: go.Part) => this.onLinkSelected(part as go.Link),
      fromEndSegmentLength: 36,
      toEndSegmentLength: 36,
      adjusting: go.LinkAdjusting.End,
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
      new go.Binding('scale', '', (d: any) =>
        (d.relationship === 'Agregacion' || d.relationship === 'Composicion') ? 2.9 : (d.styleScale ?? 1.6)
      )
    ),

    // ORIGEN ← fromMult
    $(go.TextBlock,
      {
        segmentIndex: 0,
        segmentOffset: new go.Point(10, -18),
        segmentOrientation: go.Orientation.None,
        angle: 0,
        font: LABEL_FONT,
        stroke: '#111',
        wrap: go.TextBlock.None,
        overflow: go.TextBlock.OverflowClip,
        textAlign: 'center',
      },
      new go.Binding('visible', 'fromMult', (m?: string) => !!m),
      new go.Binding('text', 'fromMult', (m?: string) => m || '')
    ),

    // DESTINO → toMult
    $(go.TextBlock,
      {
        segmentIndex: -1,
        segmentOffset: new go.Point(-10, -16),
        segmentOrientation: go.Orientation.None,
        angle: 0,
        font: MULT_FONT,
        stroke: '#111',
        wrap: go.TextBlock.None,
        overflow: go.TextBlock.OverflowClip,
        textAlign: 'center',
      },
      new go.Binding('visible', 'toMult', (m?: string) => !!m),
      new go.Binding('text', 'toMult', (m?: string) => m || '')
    )
  );
}

 
  /* ===== Helpers multiplicidad ===== */
  private getFromMultiplicityText(d: DiagramLink): string {
    if (d.relationship === 'OneToOne') return '1';
    if (d.relationship === 'OneToMany') return '1';
    return '';
  }
  private getToMultiplicityText(d: DiagramLink): string {
    if (d.relationship === 'OneToOne') return '1';
    if (d.relationship === 'OneToMany') return '*'; // mostramos como 1..*
    return '';
  }

  // Apariencia flechas
  private getArrowType = (rel: string) => (rel === 'Generalizacion' ? 'OpenTriangle' : '');
  private getFromArrow = (rel: string) =>
    (rel === 'Agregacion' || rel === 'Composicion') ? 'Diamond' : '';
  private getFromArrowFill = (rel: string) =>
    (rel === 'Composicion') ? 'black' : (rel === 'Agregacion' ? 'white' : null);
  private getDashArray = (rel: string) => (rel === 'Dependencia' ? [4, 2] : null);

  /* =======================
   *   Acciones UI
   * ======================= */
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  // === helpers de normalización ===
  private toPascal(raw: string): string {
    return raw
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca acentos
      .replace(/[^A-Za-z0-9]+/g, ' ')                  // separadores → espacio
      .trim().split(/\s+/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  }
  private toLowerCamel(raw: string): string {
    const p = this.toPascal(raw);
    return p ? p.charAt(0).toLowerCase() + p.slice(1) : p;
  }

  addEntity(): void {
    const model = this.diagram.model as go.GraphLinksModel;

    this.diagram.startTransaction('Add Entity');
    const newNode: DiagramNode = {
      key: this.idCounter++,
      name: 'Nueva Entidad',
      attributes: [],
      methods: [],
      loc: '0 0',
      userSized: false,
    };
    model.addNodeData(newNode);
    this.diagram.commitTransaction('Add Entity');

    this.sendDiagramUpdate('newNode', { nodeData: newNode });

    if (!this.diagramExists) this.persistDiagram(true);
    else this.persist$.next();
  }

// -- Helpers de normalización LLM -> GoJS Model --
normalizeAiModel(raw: any): any {
  const modelLike: any =
    (raw && raw.data && raw.data.class) ? raw.data :
    (raw && raw.model && raw.model.data && raw.model.data.class) ? raw.model.data :
    (raw || {});

  if (!modelLike.class || !String(modelLike.class).includes('GraphLinksModel')) {
    modelLike.class = 'go.GraphLinksModel';
  }
  if ('linkLabelKeysProperty' in modelLike) delete modelLike.linkLabelKeysProperty;

  let nodes: any[] = Array.isArray(modelLike.nodeDataArray) ? modelLike.nodeDataArray as any[] : [];
  let links: any[] = Array.isArray(modelLike.linkDataArray) ? modelLike.linkDataArray as any[] : [];
  modelLike.nodeDataArray = nodes;
  modelLike.linkDataArray = links;

  const cleanedNodes: any[] = [];
  for (const node of nodes as any[]) {
    const k = Number(node?.key);
    node.key = Number.isFinite(k) ? k : undefined;

    if (typeof node?.name === 'string' && node.name.trim()) {
      if ('category' in node) delete node.category;
      if (!Array.isArray(node.attributes)) node.attributes = [];
      if (!Array.isArray(node.methods))    node.methods    = [];
      cleanedNodes.push(node);
    }
  }
  nodes = cleanedNodes;
  modelLike.nodeDataArray = nodes;

  const usedKeys = new Set<number>();
  for (const n of nodes as any[]) {
    const nk = typeof n.key === 'number' ? n.key as number : NaN;
    if (!Number.isNaN(nk)) usedKeys.add(nk);
  }
  let nextNodeKey = (usedKeys.size ? Math.max(...Array.from(usedKeys)) : 0) + 1;
  for (const n of nodes as any[]) {
    if (typeof n.key !== 'number') {
      while (usedKeys.has(nextNodeKey)) nextNodeKey++;
      n.key = nextNodeKey++;
      usedKeys.add(n.key as number);
    }
  }

  const byKey = new Map<number, any>();
  for (const n of nodes as any[]) byKey.set(n.key as number, n);

  const isManyToken = (t: string) =>
    /\*/.test(t) || /[NM]/i.test(t) || (/\d+/.test(t) && Number(t) > 1);
  const normMult = (m?: string) => {
    if (!m) return '';
    const s = String(m).trim();
    if (/^\d+\.\.\*$/.test(s) || /^\d+\.\.[NnMm\*]$/.test(s)) return '*';
    if (/^\*$/i.test(s) || /^[NnMm]$/.test(s)) return '*';
    if (/^\d+$/.test(s)) return Number(s) > 1 ? '*' : '1';
    if (/^[01]\.\.[01]$/.test(s)) return s === '1..1' ? '1' : '*';
    return isManyToken(s) ? '*' : '1';
  };

  const parseRel = (rawRel: string) => {
    const R = String(rawRel || '').trim().toUpperCase().replace(/\s/g, '');
    if (!R) return '';
    if (R === '1:1' || R === '1..1') return 'OneToOne';
    if (R === '*:*' || R === 'N:N' || R === 'M:N' || R === 'N:M') return 'ManyToMany';
    if (R === '1:*' || R === '1..*' || R === '1:N' || R === '*:1' || R === 'N:1'  || R === 'M:1') return 'OneToMany';
    const m = R.match(/^([0-9NM\*]+)(?::|\.{2})([0-9NM\*]+)$/);
    if (m) {
      const leftMany  = isManyToken(m[1]);
      const rightMany = isManyToken(m[2]);
      if (leftMany && rightMany) return 'ManyToMany';
      if (!leftMany && !rightMany) return 'OneToOne';
      return 'OneToMany';
    }
    return '';
  };

  const looksLikeFkName = (s: string) => /(_id|id)$/.test(String(s || '').toLowerCase());
  const nodeHasFk = (n: any, otherName?: string) => {
    if (!n || !Array.isArray(n.attributes)) return false;
    const oname = String(otherName || '').toLowerCase();
    return n.attributes.some((a: any) => {
      const nm = String(a?.name || '').toLowerCase();
      return !!a?.foreignKey || looksLikeFkName(nm) ||
             (oname && nm.includes(oname) && looksLikeFkName(nm));
    });
  };

  const nodeKeys = new Set<number>((nodes as any[]).map((n: any) => n.key as number));
  const validPorts = new Set<string>(['T', 'L', 'R', 'B']);
  const normalizedLinks: any[] = [];
  let autoLinkKey = -1;

  for (const link of links as any[]) {
    const l: any = { ...link };

    const lk = Number(l?.key);
    const lf = Number(l?.from);
    const lt = Number(l?.to);
    l.key  = Number.isFinite(lk) ? lk : autoLinkKey--;
    l.from = Number.isFinite(lf) ? lf : NaN;
    l.to   = Number.isFinite(lt) ? lt : NaN;

    if ('labelKeys'     in l) delete l.labelKeys;
    if ('linkLabelKeys' in l) delete l.linkLabelKeys;

    if (l.fromPort && !validPorts.has(String(l.fromPort))) delete l.fromPort;
    if (l.toPort   && !validPorts.has(String(l.toPort)))   delete l.toPort;

    const canon = parseRel(l.relationship);
    if (canon) l.relationship = canon;

    if (l.fromMult) l.fromMult = normMult(l.fromMult);
    if (l.toMult)   l.toMult   = normMult(l.toMult);

    const fromNode = byKey.get(l.from as number);
    const toNode   = byKey.get(l.to   as number);
    const hintFrom = String(l.fromText || '').toLowerCase();
    const hintTo   = String(l.toText   || '').toLowerCase();
    const fromLooksFK = looksLikeFkName(hintFrom) || nodeHasFk(fromNode, toNode?.name);
    const toLooksFK   = looksLikeFkName(hintTo)   || nodeHasFk(toNode,   fromNode?.name);

    const needInfer = !(l.fromMult && l.toMult) || (l.relationship === 'OneToOne' && (fromLooksFK || toLooksFK));
    if (needInfer) {
      if (fromLooksFK && !toLooksFK)      { l.fromMult = '*'; l.toMult = '1'; }
      else if (toLooksFK && !fromLooksFK) { l.fromMult = '1'; l.toMult = '*'; }
      else if (fromLooksFK && toLooksFK)  { l.fromMult = '*'; l.toMult = '*'; }
      else {
        if (l.relationship === 'ManyToMany')      { l.fromMult='*'; l.toMult='*'; }
        else if (l.relationship === 'OneToMany')  { l.fromMult='1'; l.toMult='*'; }
        else                                      { l.fromMult='1'; l.toMult='1'; }
      }
    }

    const fm = l.fromMult || '1';
    const tm = l.toMult   || '1';
    if (fm === '*' && tm === '*')      l.relationship = 'ManyToMany';
    else if (fm === '1' && tm === '1') l.relationship = 'OneToOne';
    else                               l.relationship = 'OneToMany';

    if (typeof l.styleScale === 'undefined') l.styleScale = 1.6;

    if (Number.isFinite(l.from) && Number.isFinite(l.to) &&
        nodeKeys.has(l.from as number) && nodeKeys.has(l.to as number)) {
      normalizedLinks.push(l);
    }
  }

  modelLike.linkDataArray = normalizedLinks;
  modelLike.linkKeyProperty = 'key';
  return modelLike;
}





  deleteSelected(): void {
    if (!this.diagram) return;
    this.diagram.focus();
    this.diagram.commandHandler.deleteSelection();
    this.selectedEntity = null;
    this.selectedLink = null;
    if (this.diagramExists) this.persist$.next();
  }

  /* =======================
   *   Modal de Edición
   * ======================= */



  
  openEditDialog(): void {
    if (!this.selectedEntity) return;

    // Reset y carga
    this.entityForm.reset();
    this.attributesFA.clear();
    this.methodsFA.clear();

    const { name, attributes, methods } = this.selectedEntity.data;

    this.entityForm.get('name')?.setValue(name || '');
    (attributes || []).forEach((a: Attribute) => this.attributesFA.push(this.buildAttributeFG(a)));
    (methods || []).forEach((m: Method) => this.methodsFA.push(this.buildMethodFG(m)));

    this.newAttributeForm.reset({
      name: '',
      type: '',
      primaryKey: false,
      foreignKey: false,
    });

    this.newMethodForm.reset({
      name: '',
      type: 'void',
      visibility: 'public',
    });

    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveEntity(): void {
    if (!this.selectedEntity) return;
    if (this.entityForm.invalid) {
      this.entityForm.markAllAsTouched();
      return;
    }

    const v = this.entityForm.value as {
      name: string;
      attributes: Attribute[];
      methods: Method[];
    };

    this.diagram.startTransaction('Update Entity');

    if (!this.selectedEntity.data.userSized) {
      this.diagram.model.setDataProperty(this.selectedEntity.data, 'size', undefined);
    }
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'name', v.name);
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'attributes', v.attributes || []);
    this.diagram.model.setDataProperty(this.selectedEntity.data, 'methods', v.methods || []);

    this.diagram.commitTransaction('Update Entity');

    const updated = { ...this.selectedEntity.data };
    this.sendDiagramUpdate('updateNode', { nodeData: updated });

    this.closeModal();
    if (this.diagramExists) this.persist$.next();
  }

  // Atributos
  addAttributeFromForm(): void {
    if (this.newAttributeForm.invalid) {
      this.newAttributeForm.markAllAsTouched();
      return;
    }
    const value = this.newAttributeForm.value as Attribute;
    this.attributesFA.push(this.buildAttributeFG(value));
    this.newAttributeForm.reset({
      name: '',
      type: '',
      primaryKey: false,
      foreignKey: false,
    });
  }
  removeAttribute(index: number): void {
    this.attributesFA.removeAt(index);
  }

  // Métodos
  addMethodFromForm(): void {
    if (this.newMethodForm.invalid) {
      this.newMethodForm.markAllAsTouched();
      return;
    }
    const value = this.newMethodForm.value as Method;
    this.methodsFA.push(this.buildMethodFG(value));
    this.newMethodForm.reset({
      name: '',
      type: 'void',
      visibility: 'public',
    });
  }
  removeMethod(index: number): void {
    this.methodsFA.removeAt(index);
  }

  /* =======================
   *   Relaciones
   * ======================= */
  selectRelationship(type: typeof this.relationMode): void {
    this.relationMode = type;
    this.isCreatingRelation = true;
    this.selectedRelationship = type;

    const archetype = this.setupLinkArchetype(type);
    if (archetype && this.diagram?.toolManager?.linkingTool) {
      this.diagram.toolManager.linkingTool.archetypeLinkData = archetype;
    }
    if (this.diagram?.div) this.diagram.div.style.cursor = 'crosshair';
  }

  private setupLinkArchetype(type: typeof this.relationMode): any {
    const base = { key: undefined, styleScale: 1.6 };
    const map: Record<string, any> = {
      OneToOne: { relationship: 'OneToOne', fromMult: '1', toMult: '1' },
      OneToMany: { relationship: 'OneToMany', fromMult: '1', toMult: '*' },
      ManyToMany: { relationship: 'ManyToMany' },
      Generalizacion: { relationship: 'Generalizacion' },
      Agregacion: { relationship: 'Agregacion' },
      Composicion: { relationship: 'Composicion' },
      Recursividad: { relationship: 'Recursividad' },
      Dependencia: { relationship: 'Dependencia' },
    };
    return { ...base, ...(map[type || 'OneToOne']) };
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

  private ensureLinkMultiplicities(l: DiagramLink | any): void {
    if (!l) return;
    if (l.relationship === 'OneToOne') {
      l.fromMult = '1';
      l.toMult = '1';
    } else if (l.relationship === 'OneToMany') {
      l.fromMult = '1';
      l.toMult = '*'; // canonical
    } else {
      delete l.fromMult;
      delete l.toMult;
    }
    if (typeof l.styleScale === 'undefined') l.styleScale = 1.6;
  }

  private setupLinkByRelationType(linkData: any, relationType: string): any {
    const updated: DiagramLink = { ...(linkData as DiagramLink) };
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

    const aName = this.toPascal(a.data.name);
    const bName = this.toPascal(b.data.name);
    const joinName = `${aName}${bName}`;

    const interNode: DiagramNode = {
      key: this.idCounter++,
      name: joinName,
      attributes: [
        { name: `${this.toLowerCamel(a.data.name)}Id`, type: 'int', primaryKey: true, foreignKey: true },
        { name: `${this.toLowerCamel(b.data.name)}Id`, type: 'int', primaryKey: true, foreignKey: true },
      ],
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
      key: this.linkCounter++,
    };
    const l2: DiagramLink = {
      from: b.data.key,
      to: interNode.key,
      relationship: 'OneToMany',
      fromMult: '1',
      toMult: '*',
      styleScale: 1.6,
      key: this.linkCounter++,
    };

    model.addLinkData(l1);
    model.addLinkData(l2);
    this.diagram.commitTransaction('ManyToMany');

    this.sendDiagramUpdate('newNode', { nodeData: interNode });
    this.sendDiagramUpdate('newLink', { linkData: l1 });
    this.sendDiagramUpdate('newLink', { linkData: l2 });

    if (this.diagramExists) this.persist$.next();
  }

  /* =======================
   *   WS y Persistencia
   * ======================= */
  private connectToWebSocket(): void {
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(`${this.baseURL}/ws-diagram`),
      reconnectDelay: 5000,
      onConnect: () => {
        if (!this.sessionId) return;
        this.stompClient.subscribe(
          `/topic/diagrams/${this.sessionId}`,
          (message: IMessage) => {
            const updated = JSON.parse(message.body);
            if (!updated) return;
            if (updated.clientId && updated.clientId === this.clientId) return;
            if (this.isProcessing) {
              this.isProcessing = false;
              return;
            }
            this.handleWebSocketUpdate(updated);
          }
        );
      },
      onStompError: (err) => console.error('Error WS:', err),
    });

    this.stompClient.activate();
  }

  private sendDiagramUpdate(eventType: string, data: any): void {
    if (!this.stompClient || !this.stompClient.connected) return;
    const payload = { clientId: this.clientId, eventType, ...data };
    this.stompClient.publish({
      destination: `/app/updateDiagram/${this.sessionId}`,
      body: JSON.stringify(payload),
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
        if (it)
          Object.keys(nd).forEach((k) =>
            k !== 'key' ? model.setDataProperty(it, k, (nd as any)[k]) : null
          );
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
        break;
    }
  }

  private currentModelAsObject(): object {
    try {
      return JSON.parse(this.diagram.model.toJson());
    } catch {
      return {
        class: 'GraphLinksModel',
        nodeDataArray: [],
        linkDataArray: [],
        linkKeyProperty: 'key',
      };
    }
  }

  public updateDiagram(): void {
    this.persistDiagram();
  }

  private persistDiagram(forceCreate = false): void {
    const dataObj = this.currentModelAsObject();

    const payload: DiagramPostParams = {
      sessionId: this.sessionId,
      data: dataObj,
    };

    if (forceCreate || !this.diagramExists) {
      this.diagramService.createDiagram(payload).subscribe({
        next: () => {
          this.diagramExists = true;
        },
        error: (err) => console.error('Error al crear diagrama:', err),
      });
    } else {
      this.diagramService.updateDiagram(payload).subscribe({
        error: (err) => console.error('Error al actualizar diagrama:', err),
      });
    }
  }

  private loadDiagram(): void {
    this.diagramService.getDiagramBySession(this.sessionId).subscribe({
      next: (raw: any) => {
        const wrapper = raw?.data ?? raw;
        const modelObj = typeof wrapper === 'string' ? JSON.parse(wrapper) : wrapper;

        if (modelObj?.data?.nodeDataArray || modelObj?.nodeDataArray) {
          const m = modelObj?.data ?? modelObj;
          this.diagram.model = go.Model.fromJson(m) as go.GraphLinksModel;
          (this.diagram.model as go.GraphLinksModel).linkKeyProperty = 'key';

          const nodes = (this.diagram.model as go.GraphLinksModel).nodeDataArray as any[];
          const links = (this.diagram.model as go.GraphLinksModel).linkDataArray as any[];
          this.idCounter =
            (nodes?.reduce((max, n) => Math.max(max, Number(n.key) || 0), 0) || 0) + 1;
          this.linkCounter =
            (links?.reduce((max, l) => Math.max(max, Number(l.key) || 0), 0) || 0) + 1;

          this.diagramExists = true;
        } else {
          this.diagramExists = false;
        }
      },
      error: (err) => {
        console.error('getDiagramBySession error:', err);
        this.diagramExists = false;
      },
    });
  }

  /* =======================
   *   Utilidades GoJS
   * ======================= */
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
      visible: false,
    });
  }

  private showPorts(node: go.Node, show: boolean): void {
    if (!node || !node.ports) return;
    node.ports.each((p: go.GraphObject) => (p.visible = !!show));
  }

  private onNodeSelected(node: go.Node): void {
    if (node.isSelected) {
      this.selectedEntity = node;
      const shape = node.findObject('SHAPE') as go.Shape | null;
      if (shape) {
        shape.stroke = '#4CAF50';
        shape.strokeWidth = 2;
      }
    } else {
      this.selectedEntity = null;
      const shape = node.findObject('SHAPE') as go.Shape | null;
      if (shape) {
        shape.stroke = '#424242';
        shape.strokeWidth = 2;
      }
    }
  }

  private onLinkSelected(link: go.Link): void {
    this.selectedLink = link.isSelected ? link : null;
  }

  /* =======================
   *   Navegación / Redimensionar
   * ======================= */
  goBack(): void {
    if (window.history.length > 1) this.router.navigate(['/']);
    else this.router.navigate(['/sessions']);
  }

  toggleResizeMode(): void {
    this.resizeMode = !this.resizeMode;
    if (!this.diagram) return;
    this.diagram.startTransaction('Toggle Resizable');
    this.diagram.nodes.each((node: go.Node) => (node.resizable = this.resizeMode));
    this.diagram.commitTransaction('Toggle Resizable');
    if (this.diagramExists) this.persist$.next();
  }

  /* =======================
   *   Export Backend
   * ======================= */
  exportBackend(): void {
    if (!this.sessionId) return;

    this.isExporting = true;
    this.diagramService.exportBackend(this.sessionId).subscribe({
      next: () => {
        this.isExporting = false;
        alert('Exportación completada. Revisa tus descargas.');
      },
      error: (err) => {
        this.isExporting = false;
        console.error('Error exportación:', err);
        alert('Error durante la exportación.');
      }
    });
  }

  /* =======================
   *   Chat IA (UI + consumo)
   * ======================= */

  // Abrir/cerrar
  toggleAi() {
    this.aiOpen = !this.aiOpen;
    if (this.aiOpen) setTimeout(() => this.scrollAiToBottom(), 0);
  }
maybeSend(ev: KeyboardEvent | Event) {
  const e = ev as KeyboardEvent;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    this.sendAi();
  }
}


  private scrollAiToBottom() {
    try {
      this.aiScroll?.nativeElement?.scrollTo({ top: 999999, behavior: 'smooth' });
    } catch {}
  }

  // Enviar al backend / renderizar
sendAi() {
  const prompt = (this.aiPrompt || '').trim();
  if (!prompt || this.aiLoading) return;

  this.aiMessages.push({ role: 'user', text: prompt });
  this.aiPrompt = '';
  this.aiLoading = true;

  this.diagramService.applyInstruction(this.sessionId, { prompt, expectFullModel: true })
    .subscribe({
      next: (resp) => {
        const tips = resp?.suggestions ?? [];
        this.aiMessages.push({
          role: 'ai',
          text: tips.length ? 'He actualizado el diagrama. Recomendaciones:' : 'He actualizado el diagrama.',
          suggestions: tips
        });

        try {
          // Lo que realmente usaremos para render
          let raw: any = resp?.updatedModelJson || '{}';

          // Puede venir como string con ```json ... ```
          if (typeof raw === 'string') {
            // quitar fences si existen
            raw = raw.replace(/```json|```/g, '').trim();
            raw = JSON.parse(raw);
          }

          // Puede venir con { model: { data: {...} } } o { data: {...} }
          if (raw?.model?.data) raw = raw.model.data;
          else if (raw?.data)   raw = raw.data;

          this.renderFromAi(raw);
        } catch (e) {
          console.error('Render IA error:', e);
          this.aiMessages.push({ role: 'ai', text: 'No pude renderizar el modelo devuelto.' });
        }
      },
      error: (err) => {
        this.aiMessages.push({
          role: 'ai',
          text: 'Error al procesar: ' + (err?.error?.detail || err.message || 'desconocido')
        });
      },
      complete: () => {
        this.aiLoading = false;
        this.scrollAiToBottom();
      }
    });
}

private renderFromAi(modelJson: string | any) {
  // 0) Parse and unwrap defensivo
  let parsed: any = typeof modelJson === 'string' ? JSON.parse(modelJson) : modelJson;
  if (parsed?.model?.data) parsed = parsed.model.data;
  else if (parsed?.data)   parsed = parsed.data;

  // 1) Normalizar SIEMPRE (clase, arrays, keys, links válidos, etc.)
  const modelLike = this.normalizeAiModel(parsed); // <- tu helper

  // 2) Validaciones mínimas
  if (!Array.isArray(modelLike.nodeDataArray) || !Array.isArray(modelLike.linkDataArray)) {
    throw new Error('Modelo IA inválido: faltan nodeDataArray/linkDataArray');
  }

  // 3) Pausar side-effects mientras cambiamos el modelo
  this.isProcessing = true;

  try {
    this.diagram.startTransaction('AI Update');

    // Reemplazo completo del modelo
    this.diagram.model = (go as any).Model.fromJson(modelLike) as go.GraphLinksModel;
    (this.diagram.model as go.GraphLinksModel).linkKeyProperty = 'key';

    this.diagram.commitTransaction('AI Update');

    // 4) Recalcular contadores
    const nodes = modelLike.nodeDataArray as Array<any>;
    const links = modelLike.linkDataArray as Array<any>;

    const maxNodeKey = nodes.reduce((m, n) => Math.max(m, Number.isFinite(+n.key) ? +n.key : 0), 0);
    this.idCounter = Math.max(maxNodeKey + 1, 1);

    const maxPosLinkKey = links.reduce((m, l) => Math.max(m, +l.key > 0 ? +l.key : 0), 0);
    const minNegLinkKey = links.reduce((m, l) => Math.min(m, +l.key < 0 ? +l.key : 0), 0);
    this.linkCounter = Math.min(minNegLinkKey - 1, -1);
    // (si usas keys positivas para links en otro flujo, guarda maxPosLinkKey + 1)

    // 5) Ajuste de vista opcional
    this.diagram.zoomToFit();
    this.diagram.centerRect(this.diagram.documentBounds);
  } finally {
    this.isProcessing = false;
  }
}

  

}
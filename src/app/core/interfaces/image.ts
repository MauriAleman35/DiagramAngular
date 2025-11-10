// src/app/interfaces/diagram.ts
export interface GoJsModel {
  class: 'GraphLinksModel' | 'go.GraphLinksModel';
  nodeDataArray: any[];
  linkDataArray: any[];
  linkKeyProperty: 'key';
}

export interface DiagramEnvelope {
  data: GoJsModel;               // <- el backend siempre envuelve en { data: {...} }
}

export interface DiagramPostParams {
  sessionId: number;
  data: GoJsModel;
}

export interface AiDiagramRequest {
  prompt: string;
  expectFullModel?: boolean;     // default true en backend
}

export interface AiDiagramResponse {
  updatedModelJson: string;      // JSON string del modelo saneado
  suggestions: string[];
  rawAiResponse?: string;
}

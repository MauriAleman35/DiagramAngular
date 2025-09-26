export interface DiagramPostParams {
  sessionId: number
  data: object // JSON que contiene los diagramas
}
export interface AiDiagramRequest {
  prompt: string;
  expectFullModel?: boolean;
}
export interface AiDiagramResponse {
  updatedModelJson: string;
  suggestions: string[];
  rawAiResponse?: string;
}
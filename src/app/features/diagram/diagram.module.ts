import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramRoutingModule } from './diagram-routing.module';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card'; // o tu módulo compartido
import { MaterialModule } from '../../../material.module';
import { DiagramEditorComponent } from './pages/diagram-editor/diagram-editor.component';

@NgModule({
  declarations: [DiagramEditorComponent],
  imports: [
    CommonModule,
    DiagramRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,MaterialModule,
  ]
})
export class DiagramModule {}

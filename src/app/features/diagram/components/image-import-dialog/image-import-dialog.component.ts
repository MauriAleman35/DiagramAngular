import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { DiagramService } from '../../../../core/diagram/diagram.service';

export interface ImageImportResult {
  success: boolean;
  modelEnvelope?: { data: any };
}

@Component({
  selector: 'app-image-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    // Material (solo lo necesario para este diálogo)
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './image-import-dialog.component.html',
  styleUrls: ['./image-import-dialog.component.css'],
})
export class ImageImportDialogComponent {
  file: File | null = null;
  previewUrl: string | null = null;
  uploading = false;
  errorMsg = '';

  constructor(
    private dialogRef: MatDialogRef<ImageImportDialogComponent>,
    private diagrams: DiagramService
  ) {}

  // input file
  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] || null;
    this.setFile(f);
  }

  // drag & drop
  onDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0] || null;
    this.setFile(f);
  }
  onDragOver(ev: DragEvent) { ev.preventDefault(); }

  clear() {
    this.file = null;
    this.previewUrl = null;
    this.errorMsg = '';
  }

  private setFile(f: File | null) {
    this.errorMsg = '';
    if (!f) { this.clear(); return; }
    if (!f.type.startsWith('image/')) {
      this.errorMsg = 'Selecciona un archivo de imagen (PNG, JPG, JPEG…).';
      return;
    }
    this.file = f;
    const reader = new FileReader();
    reader.onload = () => this.previewUrl = String(reader.result);
    reader.readAsDataURL(f);
  }

  import() {
    if (!this.file || this.uploading) return;
    this.uploading = true;
    this.errorMsg = '';

    this.diagrams.importDiagramFromImage(this.file).subscribe({
      next: (env) => {
        const result: ImageImportResult = { success: true, modelEnvelope: env };
        this.dialogRef.close(result);
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || 'No se pudo procesar la imagen.';
        this.uploading = false;
      }
    });
  }

  cancel() {
    this.dialogRef.close({ success: false } as ImageImportResult);
  }
}

import { Component, Inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SessionParamsPost } from '../../../../core/interfaces/session';

@Component({
  selector: 'app-diagram-create-dialog',
  standalone: false,
  templateUrl: './diagram-create-dialog.component.html',
  styleUrl: './diagram-create-dialog.component.css'
})
export class DiagramCreateDialogComponent {
    form=new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl('',[Validators.required]),
    })

    constructor(
      public dialogRef:MatDialogRef<DiagramCreateDialogComponent>,
      @Inject(MAT_DIALOG_DATA) public data:{idHost:number}
    ){}

  create() {
    if (this.form.invalid) return;

    const session: SessionParamsPost = {
      idHost: this.data.idHost,
      name: this.form.value.name!,
      description: this.form.value.description!
    };

    this.dialogRef.close(session);
  }

  cancel() {
    this.dialogRef.close();
  }

}

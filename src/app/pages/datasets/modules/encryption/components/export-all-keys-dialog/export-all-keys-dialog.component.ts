import {
  ChangeDetectionStrategy, Component, Inject,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { switchMap } from 'rxjs/operators';
import { Dataset } from 'app/interfaces/dataset.interface';
import {
  AppLoaderService, DialogService, StorageService, WebSocketService2,
} from 'app/services';

@UntilDestroy()
@Component({
  templateUrl: './export-all-keys-dialog.component.html',
  styleUrls: ['./export-all-keys-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportAllKeysDialogComponent {
  constructor(
    private ws: WebSocketService2,
    private loader: AppLoaderService,
    private dialogRef: MatDialogRef<ExportAllKeysDialogComponent>,
    private dialogService: DialogService,
    private storageService: StorageService,
    @Inject(MAT_DIALOG_DATA) public dataset: Dataset,
  ) { }

  onDownload(): void {
    const fileName = 'dataset_' + this.dataset.name + '_keys.json';
    const mimetype = 'application/json';
    this.loader.open();
    this.ws.call('core.download', ['pool.dataset.export_keys', [this.dataset.name], fileName])
      .pipe(
        switchMap(([, url]) => this.storageService.downloadUrl(url, fileName, mimetype)),
        untilDestroyed(this),
      )
      .subscribe({
        next: () => {
          this.loader.close();
          this.dialogRef.close();
        },
        error: (error) => {
          this.loader.close();
          this.dialogService.errorReportMiddleware(error);
        },
      });
  }
}

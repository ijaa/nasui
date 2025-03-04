import { Component, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import { PoolScanFunction } from 'app/enums/pool-scan-function.enum';
import { PoolScanState } from 'app/enums/pool-scan-state.enum';
import { PoolScan } from 'app/interfaces/resilver-job.interface';
import { WebSocketService2 } from 'app/services/ws2.service';

@UntilDestroy()
@Component({
  templateUrl: './resilver-progress.component.html',
  styleUrls: ['./resilver-progress.component.scss'],
})
export class ResilverProgressDialogComponent implements OnInit {
  tooltip: string;
  hideCancel = false;
  final = false;
  progressTotalPercent = 0;
  state: PoolScanState;
  resilveringDetails: PoolScan;
  title = this.translate.instant('Resilvering Status');
  description = this.translate.instant('Resilvering pool: ');
  statusLabel = this.translate.instant('Status: ');
  diskName: string;

  readonly PoolScanState = PoolScanState;

  constructor(
    protected translate: TranslateService,
    protected ws: WebSocketService2,
  ) {}

  ngOnInit(): void {
    this.ws.subscribe('zfs.pool.scan').pipe(untilDestroyed(this)).subscribe((event) => {
      if (!event || !event.fields.scan.function.includes(PoolScanFunction.Resilver)) {
        return;
      }

      this.resilveringDetails = event.fields;
      this.diskName = this.resilveringDetails.name;
      this.progressTotalPercent = this.resilveringDetails.scan.percentage;
      this.state = this.resilveringDetails.scan.state;
    });
  }
}

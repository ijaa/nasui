import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { DiskPowerLevel } from 'app/enums/disk-power-level.enum';
import { DiskStandby } from 'app/enums/disk-standby.enum';
import { JobState } from 'app/enums/job-state.enum';
import { translateOptions } from 'app/helpers/translate.helper';
import helptext from 'app/helptext/storage/disks/disks';
import { Disk, DiskUpdate } from 'app/interfaces/storage.interface';
import { FormErrorHandlerService } from 'app/modules/ix-forms/services/form-error-handler.service';
import { SnackbarService } from 'app/modules/snackbar/services/snackbar.service';
import { DialogService } from 'app/services/dialog.service';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { WebSocketService2 } from 'app/services/ws2.service';

@UntilDestroy()
@Component({
  templateUrl: 'disk-bulk-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiskBulkEditComponent {
  diskIds: string[] = [];
  isLoading = false;
  form = this.fb.group({
    disknames: [null as string[]],
    hddstandby: [null as DiskStandby],
    advpowermgmt: [null as DiskPowerLevel],
    togglesmart: [false],
    smartoptions: [''],
  });
  readonly helptext = helptext;
  readonly helptextBulkEdit = helptext.bulk_edit;
  readonly hddstandbyOptions$ = of(helptext.disk_form_hddstandby_options);
  readonly advpowermgmtOptions$ = of(translateOptions(this.translate, this.helptext.disk_form_advpowermgmt_options));

  constructor(
    private fb: FormBuilder,
    private dialogService: DialogService,
    private ws: WebSocketService2,
    private translate: TranslateService,
    private slideInService: IxSlideInService,
    private snackbarService: SnackbarService,
    private errorHandler: FormErrorHandlerService,
  ) {}

  setFormDiskBulk(selectedDisks: Disk[]): void {
    const setForm: DiskBulkEditComponent['form']['value'] = {
      disknames: [],
      hddstandby: '' as DiskStandby,
      advpowermgmt: '' as DiskPowerLevel,
      togglesmart: false,
      smartoptions: '',
    };
    const hddStandby: DiskStandby[] = [];
    const advPowerMgt: DiskPowerLevel[] = [];
    const smartOptions: string[] = [];

    selectedDisks.forEach((disk) => {
      this.diskIds.push(disk.identifier);
      setForm.disknames.push(disk.name);
      hddStandby.push(disk.hddstandby);
      advPowerMgt.push(disk.advpowermgmt);
      if (disk.togglesmart) {
        setForm.togglesmart = true;
        smartOptions.push(disk.smartoptions);
      }
    });

    // If all items match in an array, this fills in the value in the form; otherwise, blank
    if (hddStandby.every((val, i, arr) => val === arr[0])) {
      setForm.hddstandby = hddStandby[0] || null;
    } else {
      setForm.hddstandby = null;
    }

    if (advPowerMgt.every((val, i, arr) => val === arr[0])) {
      setForm.advpowermgmt = advPowerMgt[0] || null;
    } else {
      setForm.advpowermgmt = null;
    }

    if (smartOptions.every((val, i, arr) => val === arr[0])) {
      setForm.smartoptions = smartOptions[0] || null;
    } else {
      setForm.smartoptions = null;
    }

    this.form.patchValue({ ...setForm });
    this.form.controls.disknames.disable();
  }

  prepareDataSubmit(): [id: string, update: DiskUpdate][] {
    const data = { ...this.form.value };

    if (!data.togglesmart) {
      data.smartoptions = '';
    }

    Object.keys(data).forEach((key) => {
      if (data[key as keyof typeof data] === null) {
        delete data[key as keyof typeof data];
      }
    });

    return this.diskIds.map((id) => [id, data]);
  }

  onSubmit(): void {
    const req = this.prepareDataSubmit();
    const successText = this.translate.instant('Successfully saved {n, plural, one {Disk} other {Disks}} settings.',
      { n: req.length });
    this.isLoading = true;
    this.ws.job('core.bulk', ['disk.update', req])
      .pipe(untilDestroyed(this)).subscribe({
        next: (job) => {
          if (job.state !== JobState.Success) {
            return;
          }

          this.isLoading = false;
          const isSuccessful = job.result.every((result) => {
            if (result.error !== null) {
              this.slideInService.close();
              this.dialogService.errorReport(helptext.dialog_error, result.error);
              return false;
            }

            return true;
          });

          if (isSuccessful) {
            this.slideInService.close();
            this.snackbarService.success(successText);
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.slideInService.close();
          this.errorHandler.handleWsFormError(error, this.form);
        },
      });
  }
}

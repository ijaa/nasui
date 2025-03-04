import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
  EMPTY, forkJoin, Observable, of,
} from 'rxjs';
import {
  catchError, filter, map, switchMap, tap,
} from 'rxjs/operators';
import { JobState } from 'app/enums/job-state.enum';
import { choicesToOptions } from 'app/helpers/options.helper';
import helptext from 'app/helptext/apps/apps';
import { KubernetesConfig, KubernetesConfigUpdate } from 'app/interfaces/kubernetes-config.interface';
import { EntityUtils } from 'app/modules/entity/utils';
import { FormErrorHandlerService } from 'app/modules/ix-forms/services/form-error-handler.service';
import { ApplicationsService } from 'app/pages/apps-old/applications.service';
import {
  AppLoaderService, DialogService,
} from 'app/services';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { WebSocketService2 } from 'app/services/ws2.service';

@UntilDestroy()
@Component({
  templateUrl: './kubernetes-settings.component.html',
  styleUrls: ['./kubernetes-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KubernetesSettingsComponent implements OnInit {
  isFormLoading = false;

  readonly form = this.fb.group({
    node_ip: [''],
    route_v4_interface: [''],
    route_v4_gateway: [''],
    enable_container_image_update: [true],
    configure_gpus: [true],
    servicelb: [true],
    validate_host_path: [true],
    cluster_cidr: ['', Validators.required],
    service_cidr: ['', Validators.required],
    cluster_dns_ip: ['', Validators.required],
    force: [false],
  });

  readonly reInitHelpText = helptext.kubForm.reInit.formWarning;

  readonly nodeIpOptions$ = this.appService.getBindIpChoices().pipe(choicesToOptions());

  readonly routeInterfaceOptions$ = this.appService.getInterfaces().pipe(
    map((interfaces) => {
      return interfaces.map((networkInterface) => ({
        label: networkInterface.name,
        value: networkInterface.name,
      }));
    }),
  );

  private oldConfig: KubernetesConfig;

  constructor(
    protected ws: WebSocketService2,
    private loader: AppLoaderService,
    private dialogService: DialogService,
    private slideInService: IxSlideInService,
    private appService: ApplicationsService,
    private fb: FormBuilder,
    private errorHandler: FormErrorHandlerService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadSettings();
  }

  onSubmit(): void {
    const { enable_container_image_update: enableContainerImageUpdate, ...values } = this.form.value;

    this.showReInitConfirm(values).pipe(
      filter(Boolean),
      switchMap(() => {
        this.loader.open();
        return forkJoin([
          this.ws.job('kubernetes.update', [values]),
          this.appService.updateContainerConfig(enableContainerImageUpdate),
        ]).pipe(
          tap(([job]) => {
            if (job.state !== JobState.Success) {
              return;
            }
            this.loader.close();
            this.slideInService.close();
          }),
          catchError((error) => {
            this.loader.close();
            this.errorHandler.handleWsFormError(error, this.form);
            return EMPTY;
          }),
        );
      }),
      untilDestroyed(this),
    ).subscribe();
  }

  private loadSettings(): void {
    this.isFormLoading = true;
    forkJoin([
      this.ws.call('kubernetes.config'),
      this.appService.getContainerConfig(),
    ]).pipe(untilDestroyed(this)).subscribe({
      next: ([kubernetesConfig, containerConfig]) => {
        this.form.patchValue({
          ...kubernetesConfig,
          enable_container_image_update: containerConfig.enable_image_updates,
        });

        this.oldConfig = kubernetesConfig;
        this.setHostPathCheckWarning();
        this.isFormLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isFormLoading = false;
        this.cdr.markForCheck();
        new EntityUtils().handleWsError(this, error, this.dialogService);
      },
    });
  }

  private setHostPathCheckWarning(): void {
    this.form.controls.validate_host_path.valueChanges.pipe(
      filter((value) => !value),
      switchMap(() => {
        return this.dialogService.confirm({
          title: helptext.kubForm.validateHostPath.title,
          message: helptext.kubForm.validateHostPath.warning,
        });
      }),
      untilDestroyed(this),
    ).subscribe((confirmed) => {
      if (confirmed) {
        return;
      }

      this.form.patchValue({ validate_host_path: true });
    });
  }

  private wereReInitFieldsChanged(newValues: Partial<KubernetesConfigUpdate>): boolean {
    const reInitFields = ['cluster_cidr', 'service_cidr', 'cluster_dns_ip'] as const;

    return reInitFields.some((field) => newValues[field] !== this.oldConfig[field]);
  }

  private showReInitConfirm(values: Partial<KubernetesConfigUpdate>): Observable<boolean> {
    return this.wereReInitFieldsChanged(values)
      ? this.dialogService.confirm({
        title: helptext.kubForm.reInit.title,
        message: helptext.kubForm.reInit.modalWarning,
      })
      : of(true);
  }
}

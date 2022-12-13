import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonHarness } from '@angular/material/button/testing';
import { createComponentFactory, mockProvider, Spectator } from '@ngneat/spectator/jest';
import { ExplorerNodeData } from 'app/interfaces/tree-node.interface';
import { TreeNodeProvider } from 'app/modules/ix-forms/components/ix-explorer/tree-node-provider.interface';
import { DatasetService } from 'app/services/dataset-service/dataset.service';
import { of } from 'rxjs';
import { mockCall, mockWebsocket } from 'app/core/testing/utils/mock-websocket.utils';
import { LifetimeUnit } from 'app/enums/lifetime-unit.enum';
import { PeriodicSnapshotTask } from 'app/interfaces/periodic-snapshot-task.interface';
import { IxFormsModule } from 'app/modules/ix-forms/ix-forms.module';
import { IxFormHarness } from 'app/modules/ix-forms/testing/ix-form.harness';
import { SchedulerModule } from 'app/modules/scheduler/scheduler.module';
import {
  ReplicationFormComponent,
} from 'app/pages/data-protection/replication/replication-form/replication-form.component';
import {
  expectedNewReplication
} from 'app/pages/data-protection/replication/replication-form/tests/replication-form-test-data';
import { KeychainCredentialService, LanguageService, ModalService, WebSocketService } from 'app/services';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { LocaleService } from 'app/services/locale.service';

describe('ReplicationFormComponent', () => {
  let spectator: Spectator<ReplicationFormComponent>;
  let loader: HarnessLoader;
  let form: IxFormHarness;
  let saveButton: MatButtonHarness;
  const createComponent = createComponentFactory({
    component: ReplicationFormComponent,
    imports: [
      ReactiveFormsModule,
      SchedulerModule,
      IxFormsModule,
    ],
    providers: [
      mockWebsocket([
        mockCall('replication.count_eligible_manual_snapshots', {
          eligible: 10,
          total: 50,
        }),
        mockCall('replication.create'),
        mockCall('replication.update'),
        mockCall('pool.snapshottask.query', [
          {
            id: 1,
            dataset: 'pool/dataset',
            naming_schema: 'auto-%Y-%m-%d_%H-%M',
            enabled: true,
            lifetime_unit: LifetimeUnit.Week,
            lifetime_value: 2,
          },
          {
            id: 2,
            dataset: 'pool/child',
            naming_schema: 'auto-%Y-%m-%d_%H-%M',
            enabled: true,
            lifetime_unit: LifetimeUnit.Day,
            lifetime_value: 20,
          },
        ] as PeriodicSnapshotTask[]),
      ]),
      mockProvider(KeychainCredentialService, {
        getSshConnections: () => of([
          { id: 1, name: 'remotehost.com' },
          { id: 2, name: 'truenas.com' },
        ]),
      }),
      mockProvider(ModalService),
      mockProvider(IxSlideInService),
      mockProvider(LanguageService),
      mockProvider(LocaleService),
      mockProvider(DatasetService, {
        getDatasetNodeProvider(): TreeNodeProvider {
          return () => of([
            {
              name: 'local1',
              path: '/local1',
            },
            {
              name: 'local2',
              path: '/local2',
            },
          ] as ExplorerNodeData[]);
        },
      }),
    ],
  });

  beforeEach(async () => {
    spectator = createComponent();
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
    form = await loader.getHarness(IxFormHarness);
    saveButton = await loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
  });

  describe('general form functionality', () => {
    it('shows values for an existing replication task', async () => {

      const formValues = await form.getValues();
      expect(formValues).toEqual(2);
    });

    it('creates a new replication task when new form is saved', async () => {
      await form.fillForm({
        Name: 'test',
        Transport: 'LOCAL',
        'Allow Blocks Larger than 128KB': false,
        Source: ['/local1', '/local2'],
        Destination: '/local2',
        'Properties Override': ['override=true'],
        'Properties Exclude': ['exclude'],
        'Also Include Naming Schema': '%Y%m%d%H%M',
        Schedule: true,
      });
      await form.fillForm({
        Frequency: '0 * * * *',
      });
      await form.fillForm({
        Begin: '11:00:00',
        End: '22:00:00',
      });

      await saveButton.click();

      expect(spectator.inject(WebSocketService).call).toHaveBeenCalledWith('replication.create', expectedNewReplication);
    });

    it('updates an existing replication task when update form is saved', async () => {

    });
  });

  describe('specific fields', () => {

  });
});

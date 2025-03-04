import { Router } from '@angular/router';
import { createServiceFactory, SpectatorService } from '@ngneat/spectator';
import { mockProvider } from '@ngneat/spectator/jest';
import { firstValueFrom, of } from 'rxjs';
import { MockWebsocketService2 } from 'app/core/testing/classes/mock-websocket2.service';
import { getTestScheduler } from 'app/core/testing/utils/get-test-scheduler.utils';
import { mockCall, mockWebsocket2 } from 'app/core/testing/utils/mock-websocket.utils';
import { FailoverDisabledReason } from 'app/enums/failover-disabled-reason.enum';
import { FailoverStatus } from 'app/enums/failover-status.enum';
import { WINDOW } from 'app/helpers/window.helper';
import { ApiEvent } from 'app/interfaces/api-message.interface';
import { FailoverDisabledReasonEvent } from 'app/interfaces/failover-disabled-reasons.interface';
import { SnackbarService } from 'app/modules/snackbar/services/snackbar.service';
import { SystemGeneralService } from 'app/services';
import { AuthService } from 'app/services/auth/auth.service';
import { UpdateService } from 'app/services/update.service';
import { WebsocketConnectionService } from 'app/services/websocket-connection.service';
import { SigninStore } from 'app/views/sessions/signin/store/signin.store';

describe('SigninStore', () => {
  let spectator: SpectatorService<SigninStore>;
  let websocket2: MockWebsocketService2;
  let authService: AuthService;
  const testScheduler = getTestScheduler();

  const createService = createServiceFactory({
    service: SigninStore,
    providers: [
      mockWebsocket2([
        mockCall('user.has_local_administrator_set_up', true),
        mockCall('failover.status', FailoverStatus.Single),
        mockCall('failover.get_ips', ['123.23.44.54']),
        mockCall('failover.disabled.reasons', [FailoverDisabledReason.NoLicense]),
      ]),
      mockProvider(WebsocketConnectionService, {
        isConnected$: of(true),
        websocket$: of(),
      }),
      mockProvider(Router),
      mockProvider(SnackbarService),
      mockProvider(UpdateService),
      mockProvider(SystemGeneralService, {
        loadProductType: () => of(undefined),
      }),
      {
        provide: WINDOW,
        useValue: {
          sessionStorage: {
            getItem: jest.fn(),
          },
          location: {
            protocol: 'https:',
          },
        },
      },
    ],
  });

  beforeEach(() => {
    spectator = createService();
    websocket2 = spectator.inject(MockWebsocketService2);
    authService = spectator.inject(AuthService);
    // This strips @LocalStorage() decorator from token.
    Object.defineProperty(authService, 'token2', {
      value: '',
      writable: true,
    });
    jest.spyOn(authService, 'loginWithToken').mockReturnValue(of(true));
    jest.spyOn(authService, 'generateToken').mockReturnValue(of('AUTH_TOKEN'));
    jest.spyOn(authService, 'generateTokenWithDefaultLifetime').mockReturnValue(of('AUTH_TOKEN'));
  });

  describe('selectors', () => {
    const initialFailover = {
      status: FailoverStatus.Error,
      ips: ['23.234.124.123'],
      disabledReasons: [FailoverDisabledReason.NoPong, FailoverDisabledReason.NoLicense],
    };
    const initialState = {
      failover: initialFailover,
      wasAdminSet: true,
      isLoading: false,
    };
    beforeEach(() => {
      spectator.service.setState(initialState);
    });

    it('hasRootPassword$', async () => {
      expect(await firstValueFrom(spectator.service.wasAdminSet$)).toBe(true);
    });

    it('failover$', async () => {
      expect(await firstValueFrom(spectator.service.failover$)).toBe(initialFailover);
    });

    it('isLoading$', async () => {
      expect(await firstValueFrom(spectator.service.isLoading$)).toBe(false);
    });

    it('canLogin$', async () => {
      expect(await firstValueFrom(spectator.service.canLogin$)).toBe(false);
    });
  });

  describe('handleSuccessfulLogin', () => {
    it('generates auth token and redirects user inside', () => {
      spectator.service.handleSuccessfulLogin();
      expect(authService.generateTokenWithDefaultLifetime).toHaveBeenCalledWith();
      expect(authService.token2).toBe('AUTH_TOKEN');
      expect(spectator.inject(Router).navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('init', () => {
    it('checks if root password is set and loads failover status', async () => {
      spectator.service.init();

      expect(websocket2.call).toHaveBeenCalledWith('user.has_local_administrator_set_up');
      expect(websocket2.call).toHaveBeenCalledWith('failover.status');

      expect(await firstValueFrom(spectator.service.state$)).toEqual({
        wasAdminSet: true,
        isLoading: false,
        failover: {
          status: FailoverStatus.Single,
        },
      });
    });

    it('loads additional failover info if failover status is not Single', async () => {
      websocket2.mockCall('failover.status', FailoverStatus.Master);

      spectator.service.init();

      expect(websocket2.call).toHaveBeenCalledWith('failover.get_ips');
      expect(websocket2.call).toHaveBeenCalledWith('failover.disabled.reasons');
      expect(await firstValueFrom(spectator.service.state$)).toEqual({
        wasAdminSet: true,
        isLoading: false,
        failover: {
          disabledReasons: [FailoverDisabledReason.NoLicense],
          ips: ['123.23.44.54'],
          status: FailoverStatus.Master,
        },
      });
    });

    it('logs in with token if it is present in local storage (via AuthService.token2)', () => {
      authService.token2 = 'EXISTING_TOKEN';
      spectator.service.init();

      expect(authService.loginWithToken).toHaveBeenCalled();
      expect(spectator.inject(Router).navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('init - failover subscriptions', () => {
    beforeEach(() => {
      websocket2.mockCall('failover.status', FailoverStatus.Master);
    });

    it('subscribes to failover updates if failover status is not Single', () => {
      spectator.service.init();

      expect(websocket2.subscribe).toHaveBeenCalledWith('failover.status');
      expect(websocket2.subscribe).toHaveBeenCalledWith('failover.disabled.reasons');
    });

    it('changes failover status in store when websocket event is emitted', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        jest.spyOn(websocket2, 'subscribe').mockImplementation((method) => {
          if (method !== 'failover.status') {
            return of();
          }

          return cold('a', { a: { fields: FailoverStatus.Importing } as unknown as ApiEvent<FailoverStatus> });
        });

        spectator.service.init();

        expectObservable(spectator.service.state$).toBe('a', {
          a: {
            wasAdminSet: true,
            isLoading: false,
            failover: {
              disabledReasons: [FailoverDisabledReason.NoLicense],
              ips: ['123.23.44.54'],
              status: FailoverStatus.Importing,
            },
          },
        });
      });
    });

    it('changes disabled reasons in store when websocket event is emitted', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        jest.spyOn(websocket2, 'subscribe').mockImplementation((method) => {
          if (method !== 'failover.disabled.reasons') {
            return of();
          }

          return cold('a', {
            a: {
              fields: {
                disabled_reasons: [FailoverDisabledReason.DisagreeVip],
              },
            } as unknown as ApiEvent<FailoverDisabledReasonEvent>,
          });
        });

        spectator.service.init();

        expectObservable(spectator.service.state$).toBe('a', {
          a: {
            wasAdminSet: true,
            isLoading: false,
            failover: {
              disabledReasons: [FailoverDisabledReason.DisagreeVip],
              ips: ['123.23.44.54'],
              status: FailoverStatus.Master,
            },
          },
        });
      });
    });
  });
});

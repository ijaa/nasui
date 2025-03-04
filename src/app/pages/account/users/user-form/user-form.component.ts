import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Validators } from '@angular/forms';
import { FormBuilder } from '@ngneat/reactive-forms';
import { untilDestroyed, UntilDestroy } from '@ngneat/until-destroy';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import _ from 'lodash';
import {
  combineLatest, from, Observable, of, Subscription,
} from 'rxjs';
import {
  filter, map, switchMap,
} from 'rxjs/operators';
import { allCommands } from 'app/constants/all-commands.constant';
import { choicesToOptions } from 'app/helpers/options.helper';
import helptext from 'app/helptext/account/user-form';
import { User, UserUpdate } from 'app/interfaces/user.interface';
import { forbiddenValues } from 'app/modules/entity/entity-form/validators/forbidden-values-validation';
import { matchOtherValidator } from 'app/modules/entity/entity-form/validators/password-validation/password-validation';
import { SimpleAsyncComboboxProvider } from 'app/modules/ix-forms/classes/simple-async-combobox-provider';
import { FormErrorHandlerService } from 'app/modules/ix-forms/services/form-error-handler.service';
import { IxValidatorsService } from 'app/modules/ix-forms/services/ix-validators.service';
import { userAdded, userChanged } from 'app/pages/account/users/store/user.actions';
import { selectUsers } from 'app/pages/account/users/store/user.selectors';
import { UserService } from 'app/services';
import { FilesystemService } from 'app/services/filesystem.service';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { StorageService } from 'app/services/storage.service';
import { WebSocketService2 } from 'app/services/ws2.service';
import { AppState } from 'app/store';

@UntilDestroy({ arrayName: 'subscriptions' })
@Component({
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormComponent {
  private editingUser: User;

  isFormLoading = false;
  subscriptions: Subscription[] = [];

  get isNewUser(): boolean {
    return !this.editingUser;
  }

  get title(): string {
    return this.isNewUser ? this.translate.instant('Add User') : this.translate.instant('Edit User');
  }

  form = this.fb.group({
    full_name: ['', [Validators.required]],
    username: ['', [
      Validators.required,
      Validators.pattern(UserService.namePattern),
      Validators.maxLength(16),
    ]],
    email: ['', [Validators.email]],
    password: ['', [
      this.validatorsService.validateOnCondition(
        () => this.isNewUser,
        Validators.required,
      ),
    ]],
    password_conf: ['', [
      this.validatorsService.validateOnCondition(
        () => this.isNewUser,
        Validators.required,
      ),
    ]],
    uid: [null as number, [Validators.required]],
    group: [null as number],
    group_create: [true],
    groups: [[] as number[]],
    home: ['/nonexistent', []],
    home_mode: ['755'],
    sshpubkey: [null as string],
    sshpubkey_file: [null as File[]],
    password_disabled: [false],
    shell: [null as string],
    locked: [false],
    sudo_commands: [[] as string[]],
    sudo_commands_all: [false],
    sudo_commands_nopasswd: [[] as string[]],
    sudo_commands_nopasswd_all: [false],
    smb: [true],
  });

  readonly tooltips = {
    full_name: helptext.user_form_full_name_tooltip,
    username: helptext.user_form_username_tooltip,
    email: helptext.user_form_email_tooltip,
    password: helptext.user_form_password_tooltip,
    password_edit: helptext.user_form_password_edit_tooltip,
    password_conf_edit: helptext.user_form_password_edit_tooltip,
    uid: helptext.user_form_uid_tooltip,
    group: helptext.user_form_primary_group_tooltip,
    group_create: helptext.user_form_group_create_tooltip,
    groups: helptext.user_form_aux_groups_tooltip,
    home: helptext.user_form_dirs_explorer_tooltip,
    home_mode: helptext.user_form_home_dir_permissions_tooltip,
    sshpubkey: helptext.user_form_auth_sshkey_tooltip,
    password_disabled: helptext.user_form_auth_pw_enable_tooltip,
    shell: helptext.user_form_shell_tooltip,
    locked: helptext.user_form_lockuser_tooltip,
    smb: helptext.user_form_smb_tooltip,
  };

  readonly groupOptions$ = this.ws.call('group.query').pipe(
    map((groups) => groups.map((group) => ({ label: group.group, value: group.id }))),
  );
  readonly shellOptions$ = this.ws.call('user.shell_choices').pipe(choicesToOptions());
  readonly treeNodeProvider = this.filesystemService.getFilesystemNodeProvider();
  readonly shellProvider = new SimpleAsyncComboboxProvider(this.shellOptions$);
  readonly groupProvider = new SimpleAsyncComboboxProvider(this.groupOptions$);

  constructor(
    private ws: WebSocketService2,
    private errorHandler: FormErrorHandlerService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private translate: TranslateService,
    private validatorsService: IxValidatorsService,
    private filesystemService: FilesystemService,
    private slideIn: IxSlideInService,
    private storageService: StorageService,
    private store$: Store<AppState>,
  ) { }

  /**
   * @param user Skip argument to add new user.
   */
  setupForm(user?: User): void {
    this.editingUser = user;

    this.form.controls.sshpubkey_file.valueChanges.pipe(
      switchMap((files: File[]) => {
        return !files?.length ? of('') : from(files[0].text());
      }),
      untilDestroyed(this),
    ).subscribe((key) => {
      this.form.controls.sshpubkey.setValue(key);
    });

    this.form.controls.password_conf.addValidators(
      this.validatorsService.withMessage(
        matchOtherValidator('password'),
        this.translate.instant(this.isNewUser ? 'Password and confirmation should match.' : 'New password and confirmation should match.'),
      ),
    );

    if (user?.home && user.home !== '/nonexistent') {
      this.storageService.filesystemStat(user.home).pipe(untilDestroyed(this)).subscribe((stat) => {
        this.form.patchValue({ home_mode: stat.mode.toString(8).substring(2, 5) });
      });
    } else {
      this.form.patchValue({ home_mode: '755' });
    }
    this.subscriptions.push(
      this.form.controls.locked.disabledWhile(this.form.controls.password_disabled.value$),
      this.form.controls.password.disabledWhile(this.form.controls.password_disabled.value$),
      this.form.controls.password_conf.disabledWhile(this.form.controls.password_disabled.value$),
      this.form.controls.group.disabledWhile(this.form.controls.group_create.value$),
      this.form.controls.sudo_commands.disabledWhile(this.form.controls.sudo_commands_all.value$),
      this.form.controls.sudo_commands_nopasswd.disabledWhile(this.form.controls.sudo_commands_nopasswd_all.value$),
    );

    if (this.isNewUser) {
      this.setupNewUserForm();
    } else {
      this.setupEditUserForm(user);
    }
  }

  onSubmit(): void {
    const values = this.form.value;
    const body: UserUpdate = {
      email: values.email ? values.email : null,
      full_name: values.full_name,
      group: values.group,
      groups: values.groups,
      home_mode: values.home_mode,
      home: values.home,
      locked: values.password_disabled ? false : values.locked,
      password_disabled: values.password_disabled,
      shell: values.shell,
      smb: values.smb,
      sshpubkey: values.sshpubkey,
      sudo_commands: values.sudo_commands_all ? [allCommands] : values.sudo_commands,
      sudo_commands_nopasswd: values.sudo_commands_nopasswd_all ? [allCommands] : values.sudo_commands_nopasswd,
      username: values.username,
    };

    this.isFormLoading = true;
    let request$: Observable<unknown>;
    if (this.isNewUser) {
      request$ = this.ws.call('user.create', [{
        ...body,
        group_create: values.group_create,
        password: values.password,
        uid: values.uid,
      }]);
    } else {
      const passwordNotEmpty = values.password !== '' && values.password_conf !== '';
      if (passwordNotEmpty && !values.password_disabled) {
        body.password = values.password;
      }
      request$ = this.ws.call('user.update', [this.editingUser.id, body]);
    }

    request$.pipe(
      switchMap((id) => this.ws.call('user.query', [[['id', '=', id]]])),
      map((users) => users[0]),
      untilDestroyed(this),
    ).subscribe({
      next: (user) => {
        if (this.isNewUser) {
          this.store$.dispatch(userAdded({ user }));
        } else {
          this.store$.dispatch(userChanged({ user }));
        }
        this.isFormLoading = false;
        this.slideIn.close();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isFormLoading = false;
        this.errorHandler.handleWsFormError(error, this.form);
        this.cdr.markForCheck();
      },
    });
  }

  onDownloadSshPublicKey(): void {
    const name = this.form.controls.username.value;
    const key = this.form.controls.sshpubkey.value;
    const blob = new Blob([key], { type: 'text/plain' });
    this.storageService.downloadBlob(blob, `${name}_public_key_rsa`);
  }

  getUsernameHint(): string {
    if (this.form.controls.username?.value?.length > 8) {
      return this.translate.instant('Usernames can be up to 16 characters long. When using NIS or other legacy software with limited username lengths, keep usernames to eight characters or less for compatibility.');
    }
    return null;
  }

  private setupNewUserForm(): void {
    this.setNamesInUseValidator();
    this.setHomeSharePath();
    this.setNextUserId();
    this.setFirstShellOption();
    this.detectFullNameChanges();

    this.subscriptions.push(
      this.form.controls.password.disabledWhile(this.form.controls.password_disabled.value$),
      this.form.controls.password_conf.disabledWhile(this.form.controls.password_disabled.value$),
      this.form.controls.locked.disabledWhile(this.form.controls.password_disabled.value$),
    );
  }

  private setupEditUserForm(user: User): void {
    this.form.patchValue({
      email: user.email,
      full_name: user.full_name,
      group_create: false,
      group: user.group.id,
      groups: user.groups,
      home: user.home,
      locked: user.locked,
      password_disabled: user.password_disabled,
      shell: user.shell,
      smb: user.smb,
      sshpubkey: user.sshpubkey,
      sudo_commands: user.sudo_commands?.includes(allCommands) ? [] : user.sudo_commands,
      sudo_commands_all: user.sudo_commands?.includes(allCommands),
      sudo_commands_nopasswd: user.sudo_commands_nopasswd?.includes(allCommands) ? [] : user.sudo_commands_nopasswd,
      sudo_commands_nopasswd_all: user.sudo_commands_nopasswd?.includes(allCommands),
      uid: user.uid,
      username: user.username,
    });

    this.form.controls.uid.disable();
    this.form.controls.group_create.disable();

    if (user.immutable) {
      this.form.controls.group.disable();
      this.form.controls.home_mode.disable();
      this.form.controls.home.disable();
      this.form.controls.username.disable();
    }

    this.setNamesInUseValidator(user.username);
  }

  private detectFullNameChanges(): void {
    this.form.controls.full_name.valueChanges.pipe(
      map((fullName) => this.getUserName(fullName)),
      filter((username) => !!username),
      untilDestroyed(this),
    ).subscribe((username) => {
      this.form.patchValue({ username });
      this.form.controls.username.markAsTouched();
    });
  }

  private setHomeSharePath(): void {
    this.ws.call('sharing.smb.query', [[
      ['enabled', '=', true],
      ['home', '=', true],
    ]]).pipe(
      filter((shares) => !!shares.length),
      map((shares) => shares[0].path),
      switchMap((homeSharePath) => {
        this.form.patchValue({ home: homeSharePath });

        return combineLatest([of(homeSharePath), this.form.controls.username.valueChanges]);
      }),
      untilDestroyed(this),
    ).subscribe(([homeSharePath, username]) => {
      this.form.patchValue({ home: `${homeSharePath}/${username}` });
    });
  }

  private setNextUserId(): void {
    this.ws.call('user.get_next_uid').pipe(untilDestroyed(this)).subscribe((nextUid) => {
      this.form.patchValue({ uid: nextUid });
    });
  }

  private setFirstShellOption(): void {
    this.shellOptions$.pipe(
      filter((shells) => !!shells.length),
      map((shells) => shells[0].value),
      untilDestroyed(this),
    ).subscribe((firstShell: string) => {
      this.form.patchValue({ shell: firstShell });
    });
  }

  private setNamesInUseValidator(currentName?: string): void {
    this.store$.select(selectUsers).pipe(untilDestroyed(this)).subscribe((users) => {
      let forbiddenNames = users.map((user) => user.username);
      if (currentName) {
        forbiddenNames = _.remove(forbiddenNames, currentName);
      }
      this.form.controls.username.addValidators(forbiddenValues(forbiddenNames));
    });
  }

  private getUserName(fullName: string): string {
    let username: string;
    const formatted = fullName.trim().split(/[\s,]+/);
    if (formatted.length === 1) {
      username = formatted[0];
    } else {
      username = formatted[0][0] + formatted.pop();
    }
    if (username.length >= 8) {
      username = username.substring(0, 8);
    }

    return username.toLocaleLowerCase();
  }
}

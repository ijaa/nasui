# coding=utf-8
"""SCALE UI: feature tests."""

import xpaths
from function import (
    wait_on_element,
    is_element_present,
    wait_on_element_disappear
)
from pytest_bdd import (
    given,
    scenario,
    then,
    when,
)


@scenario('features/NAS-T1101.feature', 'Wipe disks not in a pool')
def test_wipe_disks_not_in_a_pool():
    """Wipe disks not in a pool."""


@given('the browser is open, the TrueNAS URL and logged in')
def the_browser_is_open_the_truenas_url_and_logged_in(driver, nas_ip, root_password):
    """the browser is open, the TrueNAS URL and logged in."""
    if nas_ip not in driver.current_url:
        driver.get(f"http://{nas_ip}")
        assert wait_on_element(driver, 10, xpaths.login.user_Input)
    if not is_element_present(driver, xpaths.side_Menu.dashboard):
        assert wait_on_element(driver, 10, xpaths.login.user_Input)
        driver.find_element_by_xpath(xpaths.login.user_Input).clear()
        driver.find_element_by_xpath(xpaths.login.user_Input).send_keys('root')
        driver.find_element_by_xpath(xpaths.login.password_Input).clear()
        driver.find_element_by_xpath(xpaths.login.password_Input).send_keys(root_password)
        assert wait_on_element(driver, 5, xpaths.login.signin_Button)
        driver.find_element_by_xpath(xpaths.login.signin_Button).click()
    else:
        assert wait_on_element(driver, 10, xpaths.side_Menu.dashboard, 'clickable')
        driver.find_element_by_xpath(xpaths.side_Menu.dashboard).click()


@when('on the dashboard, click Storage on the side menu')
def on_the_dashboard_click_storage_on_the_side_menu(driver):
    """on the dashboard, click Storage on the side menu."""
    assert wait_on_element(driver, 10, xpaths.dashboard.title)
    assert wait_on_element(driver, 10, xpaths.dashboard.system_Info_Card_Title)
    assert wait_on_element(driver, 10, xpaths.side_Menu.storage, 'clickable')
    driver.find_element_by_xpath(xpaths.side_Menu.storage).click()


@then('on the Storage Dashboard page, click the Disks button')
def on_the_storage_dashboard_page_click_the_disks_button(driver):
    """on the Storage Dashboard page, click the Disks button."""
    assert wait_on_element(driver, 10, xpaths.storage.title)
    assert wait_on_element(driver, 10, xpaths.storage.disks_Button, 'clickable')
    driver.find_element_by_xpath(xpaths.storage.disks_Button).click()


@then('the Disks page shoule appears')
def the_disks_page_shoule_appears(driver):
    """the Disks page shoule appears,."""
    assert wait_on_element(driver, 7, xpaths.disks.title)


@then('expand N/A pool disks, click wipe select quick press Wipe and confirm, then close when finished')
def expand_na_pool_disks_click_wipe_select_quick_press_wipe_and_confirm_then_close_when_finished(driver):
    """expand N/A pool disks, click wipe select quick press Wipe and confirm, then close when finished."""
    disk_list = []
    disk_elements = driver.find_elements_by_xpath(xpaths.disks.all_Disk)
    for disk_element in disk_elements:
        if is_element_present(driver, f'//tr[contains(.,"{disk_element.text}")]//div[contains(text(),"N/A") or contains(text(),"Exported")]'):
            disk_list.append(disk_element.text)

    for disk in disk_list:
        assert wait_on_element(driver, 7, xpaths.disks.disk_Expander(disk), 'clickable')
        driver.find_element_by_xpath(xpaths.disks.disk_Expander(disk)).click()
        assert wait_on_element(driver, 7, xpaths.disks.wipe_Disk_Button(disk), 'clickable')
        driver.find_element_by_xpath(xpaths.disks.wipe_Disk_Button(disk)).click()
        assert wait_on_element(driver, 7, xpaths.disks.confirm_Box_Title(disk))
        assert wait_on_element(driver, 7, xpaths.disks.wipe_Button, 'clickable')
        driver.find_element_by_xpath(xpaths.disks.wipe_Button).click()
        assert wait_on_element(driver, 7, xpaths.disks.confirm_Box_Title(disk))
        assert wait_on_element(driver, 7, xpaths.checkbox.old_Confirm, 'clickable')
        driver.find_element_by_xpath(xpaths.checkbox.old_Confirm).click()
        assert wait_on_element(driver, 7, xpaths.button.Continue, 'clickable')
        driver.find_element_by_xpath(xpaths.button.Continue).click()
        assert wait_on_element(driver, 10, xpaths.progress.progressbar)
        assert wait_on_element_disappear(driver, 60, xpaths.progress.progressbar)
        assert wait_on_element(driver, 15, '//span[contains(.,"Disk Wiped successfully")]')
        assert wait_on_element(driver, 5, xpaths.button.close, 'clickable')
        driver.find_element_by_xpath(xpaths.button.close).click()
        assert wait_on_element_disappear(driver, 7, xpaths.disks.confirm_Box_Title(disk))

import { expect, test } from '@playwright/test';
import { api, buyableProduct, login, watchErrors } from './helpers';

// One journey across three roles: customer buys → brand fulfils → customer sees it delivered.
test.describe.serial('order journey', () => {
  let orderNumber = '';

  test('customer adds to bag and places a COD order @mobile', async ({ page, request }) => {
    const errors = watchErrors(page);
    const { p, v } = await buyableProduct(request);
    await login(page, 'customer');
    await page.goto('/en/p/' + p.slug);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const size = page.getByRole('button', { name: v.size, exact: true });
    if (v.size && (await size.count())) await size.first().click();
    await page.getByRole('button', { name: 'Add to bag' }).click();
    await expect(page.getByText('Added to bag').first()).toBeVisible();

    await page.goto('/en/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    // Regression: a saved address must be preselected (the new-address form used to stay open).
    await expect(page.getByRole('radio').first()).toBeChecked();
    await page.locator('label').filter({ hasText: 'Cash on delivery' }).click();
    await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeChecked();
    const place = page.getByRole('button', { name: 'Place order' });
    await expect(place).toBeEnabled();
    await place.click();

    await expect(page).toHaveURL(/\/account\/orders\/[^/?]+\?placed=1/);
    orderNumber = decodeURIComponent(page.url().split('/account/orders/')[1].split('?')[0]);
    await expect(page.getByText(orderNumber).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('brand confirms, ships and delivers from the seller hub', async ({ page }) => {
    test.skip(!orderNumber, 'needs the order from the previous step');
    await login(page, 'kemet');
    await page.goto('/en/seller/orders');
    await page.getByText(orderNumber, { exact: false }).first().click();
    await expect(page).toHaveURL(/\/seller\/orders\/[a-f0-9]{24}/);

    await page.getByRole('button', { name: 'Confirm order' }).click();
    await page.getByRole('button', { name: 'Mark processing' }).click();
    await page.getByRole('button', { name: 'Mark shipped' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Courier name').fill('Bosta');
    await dialog.getByRole('button', { name: 'Mark shipped' }).click();
    await page.getByRole('button', { name: 'Mark delivered' }).click();
    await expect(page.getByRole('button', { name: 'Mark delivered' })).toHaveCount(0);
  });

  test('customer sees the order delivered and COD collected', async ({ page }) => {
    test.skip(!orderNumber, 'needs the order from the first step');
    await login(page, 'customer');
    const order = await api(page.request, 'GET', '/orders/' + encodeURIComponent(orderNumber));
    expect(order.subOrders[0].status).toBe('DELIVERED');
    expect(order.subOrders[0].paymentStatus).toBe('COLLECTED');
    await page.goto('/en/account/orders/' + orderNumber);
    await expect(page.getByText(orderNumber).first()).toBeVisible();
  });

  test('the bag is empty after checkout', async ({ page }) => {
    await login(page, 'customer');
    await page.goto('/en/checkout');
    await expect(page.getByText('Your bag is empty.')).toBeVisible();
  });
});

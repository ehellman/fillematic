import puppeteer, { CookieData } from 'npm:puppeteer';
import 'jsr:@std/dotenv/load';

type SiteCookiesObject = {
  cookies: CookieData[];
};

const REFRESH_INTERVAL = Deno.env.get('REFRESH_INTERVAL')!;
const DESIRED_PAYMENT_METHOD = Deno.env.get('DESIRED_PAYMENT_METHOD')! as DesiredPaymentMethod;
const SWISH_PHONE_NUMBER = Deno.env.get('SWISH_PHONE_NUMBER')!;
const FINALIZE_PAYMENT = Deno.env.get('FINALIZE_PAYMENT')!;

const CARD_NUMBER = Deno.env.get('CARD_NUMBER')!;
const CARD_EXPIRY = Deno.env.get('CARD_EXPIRY')!;
const CARD_CVC = Deno.env.get('CARD_CVC')!;
const CARD_NAME = Deno.env.get('CARD_NAME')!;

const urls = {
  start: Deno.env.get('URL_START')!,
  product: Deno.env.get('URL_PRODUCT')!,
};

const ele = {
  cookie: {
    decline: {
      id: 'declineButton',
      class: 'cookie-notice__button--decline',
    },
  },
  loginButton: {
    open: {
      id: 'openLogin',
    },
  },
  loginModal: {
    id: 'loginModal',
    form: {
      id: 'loginForm',
      usernameInputId: 'UserName',
      passwordInputId: 'Password',
    },
  },
  buyButton: {
    parentClass: 'site-product-stock-price-buy',
    selector: '[data-form-action="addToBasket"]',
  },
  basket: {
    parentClass: 'site-basket-divs',
    toCheckoutButton: {
      class: 'site-btn-green',
      selector: '[href="/Basket/CheckOut"]',
    },
  },
  checkout: {
    parentClass: 'site-checkout',
    acceptTerms: {
      parentClass: 'acceptTermsBtnContainer',
      buttonId: 'traidConditionsAnswer',
    },
  },
  loggedIn: {
    selector: '.user-profile-link', // Update this with actual selector
  },
} as const;

function log(msg: string) {
  console.log('[LOG]: ', msg);
}

function cookieHasNotExpired(cookie: CookieData): boolean {
  // If the cookie's `expires` value is -1, it means it's a session cookie which doesn't expire
  if (!cookie.expires || cookie.expires === -1) {
    return true;
  }
  // Compare the cookie's expires time with the current time (in seconds)
  const currentTime = Math.floor(Date.now() / 1000); // Current time in UNIX timestamp (seconds)
  return cookie.expires > currentTime;
}

async function saveSession(
  browser: puppeteer.Browser,
  // , page: puppeteer.Page
) {
  const context = browser.defaultBrowserContext();
  const cookies = await context.cookies();

  console.log({
    cookies: JSON.stringify(cookies),
    ls: Object.assign({}, globalThis.localStorage),
    ss: Object.assign({}, globalThis.sessionStorage),
  });

  // Get both storage types
  // const storage: StorageData = await page.evaluate(() => ({
  //   localStorage: Object.assign({}, globalThis.localStorage),
  //   sessionStorage: Object.assign({}, globalThis.sessionStorage)
  // }));

  await Deno.writeTextFile(
    './session.json',
    JSON.stringify({
      cookies,
      // storage
    }),
  );
  log('Session saved!');
}

async function loadSession(browser: puppeteer.Browser) {
  try {
    const sessionData: SiteCookiesObject = JSON.parse(
      await Deno.readTextFile('./session.json'),
    );

    if (
      sessionData.cookies?.length > 0 &&
      sessionData.cookies.every(cookieHasNotExpired)
    ) {
      const context = browser.defaultBrowserContext();
      // await context.clearCookies();
      await context.setCookie(...sessionData.cookies);

      log('Session loaded!');
      return true;
    } else {
      log('Uh oh, session cookies have expired!');
      return false;
    }
  } catch (e) {
    log('No saved session found or error loading session:' + e);
    return false;
  }
}

async function handleCookieNotice(page: puppeteer.Page) {
  try {
    await page.evaluate((data) => {
      window.scrollTo(0, Math.floor(Math.random() * (data.scrollMax - data.scrollMin + 1)) + data.scrollMin);
    }, { scrollMin: 20, scrollMax: 250 });

    const declineButton = await page.waitForSelector(
      `#${ele.cookie.decline.id}`,
      { visible: true, timeout: 15000 },
    );
    await declineButton?.click();
    log('Declined cookies');
  } catch (_e) {
    log('No cookie notice found or already handled');
  }
}

async function findCurrentCheckoutStep(page: puppeteer.Page) {
  const allSteps = ['1', '2', '3', '4'];

  const mutedSteps = await page.evaluate(() => {
    const steps = Array.from(document.querySelectorAll('.text-muted .checkOutStep'));

    return steps.map((step) => step.textContent);
  });
  return allSteps.find((step) => !mutedSteps.includes(step));
}

type DesiredPaymentMethod = 'swish' | 'visa' | 'mastercard';

async function selectPaymentMethod(page: puppeteer.Page, desiredPaymentMethod: DesiredPaymentMethod) {
  await page.evaluate((data) => {
    let didClickDesiredPaymentMethod = false;

    Array.from(document.querySelectorAll('.site-paymentTypes li button[name="paymentOption"]')).map((option) => {
      const providerName = option.querySelector('.col-md-6.col-sm-5.col-xs-9 b')?.textContent?.trim();
      if (!providerName) return false;
      if (
        providerName?.toLowerCase().includes(data.desiredPaymentMethod)
      ) {
        (option as HTMLButtonElement).click();
        didClickDesiredPaymentMethod = true;
      }
    });

    return new Promise((resolve, reject) =>
      didClickDesiredPaymentMethod ? resolve(didClickDesiredPaymentMethod) : reject(didClickDesiredPaymentMethod)
    );
  }, { desiredPaymentMethod });
}

async function selectDeliveryMethod(page: puppeteer.Page) {
  await page.evaluate(() => {
    let didClickDesiredDeliveryOption = false;

    Array.from(document.querySelectorAll('.optionRow')).map((option) => {
      const carrier = option.querySelector('.site-carrierName');
      if (!carrier) return false;
      const carrierName = carrier.querySelector('& > b');
      const deliveryType = carrier.querySelector('.site-deliveryTotalPriceWithVat + div');
      if (
        carrierName?.textContent?.toLowerCase().includes('postnord') && deliveryType?.textContent?.includes('Hempaket')
      ) {
        const radioButton: HTMLDivElement | null = option.querySelector(
          '.site-radioMethod .deliveryOptionRadioContainer',
        );
        if (radioButton) {
          radioButton.click();
          didClickDesiredDeliveryOption = true;
        }
      }
    });

    return new Promise((resolve, reject) =>
      didClickDesiredDeliveryOption ? resolve(didClickDesiredDeliveryOption) : reject(didClickDesiredDeliveryOption)
    );
  });

  const nextButton = await page.waitForSelector('#DeliveryOptionsForm .nextBtnContainer .site-btn-green', {
    visible: true,
  });
  await nextButton?.click();
}
async function logIn(page: puppeteer.Page) {
  // Go to start page
  await page.goto(urls.start, { waitUntil: 'networkidle2', timeout: 30_000 });
  console.log('networkidle2 occurred');
  // Handle cookie notice if present
  console.log('waiting for cookie banner');
  await handleCookieNotice(page);
  // Open login modal
  let loginButton = await page.waitForSelector(`#${ele.loginButton.open.id}`);
  await loginButton?.click();
  await page.waitForSelector(`#${ele.loginModal.id}`, { visible: true });
  log('Opened login modal');
  await page.waitForSelector(`#${ele.loginModal.form.id}`, { visible: true });
  const usernameInput = await page.waitForSelector(
    `#${ele.loginModal.form.usernameInputId}`,
  );
  await usernameInput?.type(Deno.env.get('USERNAME')!);
  const passwordInput = await page.waitForSelector(
    `#${ele.loginModal.form.passwordInputId}`,
  );
  await passwordInput?.type(Deno.env.get('PASSWORD')!);
  await page.keyboard.press('Enter');
  await page.waitForNavigation();
  loginButton = await page.waitForSelector(
    `#${ele.loginButton.open.id}.hidden`,
  );
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();

  // Try to load previous session
  const sessionLoaded = await loadSession(browser);

  if (!sessionLoaded) {
    await logIn(page);
    await saveSession(browser);
  } else {
    await saveSession(browser);
  }

  // Continue with the rest of the script
  await page.goto(urls.product);

  let buyButtonActive = false;

  let refreshCount = 1;
  while (!buyButtonActive) {
    log(`Starting monitoring for buy button (round ${refreshCount})...`);
    try {
      await page.waitForSelector(
        `.${ele.buyButton.parentClass} ${ele.buyButton.selector}`,
        {
          visible: true,
          timeout: parseInt(REFRESH_INTERVAL),
        },
      );
      buyButtonActive = true;
      log(`GREAT SUCCESS! FOUND BUY BUTTON AFTER ${refreshCount} TRIES!`);
    } catch (_e) {
      refreshCount++;
      log('Buy button not found yet, refreshing page...');
      await page.reload();
    }
  }

  const buyButton = await page.waitForSelector(
    `.${ele.buyButton.parentClass} ${ele.buyButton.selector}`,
  );

  await buyButton?.click();
  await page.waitForNavigation();

  // verify quantity
  const productLines = await page.$$eval('#basketLines li', (els) => els.length);

  if (productLines > 1) {
    // MANUAL INTERVENTION
    console.warn('[WARNING]: MULTIPLE PRODUCT LINES DETECTED. PLEASE FIX CART MANUALLY AND PRESS GO TO CHECKOUT');
  }

  const quantityValue = await page.$eval('input.quantity', (el) => parseInt(el.value));

  if (quantityValue > 1) {
    // MANUAL INTERVENTION
    console.warn('[WARNING]: MULTIPLE QUANTITY DETECTED. PLEASE FIX CART MANUALLY AND PRESS GO TO CHECKOUT');
  }

  console.log({ productLines, quantityValue });

  if (productLines === 1 && quantityValue === 1) {
    console.log('[CART] cart looks good, proceeding to checkout automatically');
    const toCheckoutButton = await page.waitForSelector(
      `.${ele.basket.parentClass} .${ele.basket.toCheckoutButton.class}${ele.basket.toCheckoutButton.selector}`,
    );
    await toCheckoutButton?.click();
  }

  await page.waitForSelector('body.siteBodyBasketCheckOut');
  // await page.waitForNavigation({ waitUntil: 'networkidle2' });

  let currentStep = await findCurrentCheckoutStep(page);

  if (currentStep === '1') {
    console.warn('WARNING: SOMETHING IS WRONG. NO PREFILLED INFO???');
  }

  // step 2
  console.log(`[checkout.step${currentStep}]: accepting terms`);
  const acceptTermsButton = await page.waitForSelector(
    `.${ele.checkout.acceptTerms.parentClass} #${ele.checkout.acceptTerms.buttonId}`,
  );
  await acceptTermsButton?.click();
  await page.waitForNavigation();
  // await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // step 3
  currentStep = await findCurrentCheckoutStep(page);
  console.log(`[checkout.step${currentStep}]: delivery method - pick one`);

  await page.waitForSelector('.site-checkOut-deliveryoptions', { visible: true });

  // the idea here is if selectDeliveryMethod fails, you will be able to select the delivery method manually
  // and the Promise.race will trigger on the paymenoptions selector showing, continuing the script
  await Promise.race([
    await selectDeliveryMethod(page).catch(() =>
      console.log('[MANUAL INTERVENTION REQUIRED] Failed to select delivery method, select one yourself')
    ),
    await page.waitForSelector('.site-checkOut-paymentoptions', { visible: true }),
  ]);

  currentStep = await findCurrentCheckoutStep(page);
  console.log(`[checkout.step${currentStep}]: payment method`);

  try {
    await selectPaymentMethod(page, DESIRED_PAYMENT_METHOD);

    if (DESIRED_PAYMENT_METHOD === 'swish') {
      const swishInput = await page.waitForSelector('#swishphonenumber', { visible: true });
      await swishInput?.type(SWISH_PHONE_NUMBER);

      if (FINALIZE_PAYMENT === 'true') {
        const swishContinueBtn = await page.waitForSelector('#swishContinueBtn');
        await swishContinueBtn?.click();
      } else {
        console.log('[MANUAL INTERVENTION REQUIRED] FINALIZE_PAYMENT is set to false, finalize payment yourself');
      }

      console.log('[COMPLETED] Swish payment flow');
    } else if (DESIRED_PAYMENT_METHOD === 'mastercard' || DESIRED_PAYMENT_METHOD === 'visa') {
      let formIsInvalid = false;

      // card number
      const cardInput = await page.waitForSelector('#cardnumberInptTxt', { visible: true });
      await cardInput?.type(CARD_NUMBER);
      const cardInputInvalid = await page.$eval('#cardnumberInptTxt', (el) => el.getAttribute('aria-invalid'));
      cardInputInvalid === 'true' && (formIsInvalid = true);

      // expiry
      const expiryInput = await page.waitForSelector('#expirationInptTxt', { visible: true });
      await expiryInput?.type(CARD_EXPIRY);
      const expiryInputInvalid = await page.$eval('#expirationInptTxt', (el) => el.getAttribute('aria-invalid'));
      expiryInputInvalid === 'true' && (formIsInvalid = true);

      // cvc
      const cvcInput = await page.waitForSelector('#cvcInptTxt', { visible: true });
      await cvcInput?.type(CARD_CVC);
      const cvcInputInvalid = await page.$eval('#cvcInptTxt', (el) => el.getAttribute('aria-invalid'));
      cvcInputInvalid === 'true' && (formIsInvalid = true);

      // cvc
      const holderNameInput = await page.waitForSelector('#cardholderNameInptTxt', { visible: true });
      await holderNameInput?.type(CARD_NAME);
      const holderNameInputInvalid = await page.$eval(
        '#cardholderNameInptTxt',
        (el) => el.getAttribute('aria-invalid'),
      );
      holderNameInputInvalid === 'true' && (formIsInvalid = true);

      if (formIsInvalid) {
        console.log('[MANUAL INTERVENTION REQUIRED] Payment form is invalid, fill it yourself');
      } else {
        if (FINALIZE_PAYMENT === 'true') {
          const cardContinueBtn = await page.waitForSelector('#payBtn');
          await cardContinueBtn?.click();
        } else {
          console.log('[MANUAL INTERVENTION REQUIRED] FINALIZE_PAYMENT is set to false, finalize payment yourself');
        }
        console.log('[COMPLETED] MasterCard payment flow');
      }
    }
  } catch (e) {
    console.log('[MANUAL INTERVENTION REQUIRED] Failed to select payment method, select one yourself. ' + e);
  }
})();

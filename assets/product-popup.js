/**
 * Gift guide popup, variant selection, and the Soft Winter Jacket bundle.
 *
 * Bundle rule:
 * - Match option names, not positions. Accepted names are Color/Colour and Size.
 * - Trigger only when the selected values are Black and Medium.
 * - Resolve "Soft Winter Jacket" from the section payload, then from predictive search.
 * - Companion variant: the first available variant in Shopify position order.
 * - Never hardcode a variant id. Skip the companion when it is the selected product,
 *   when that variant is already in the cart, or when no available variant exists.
 * - Add both lines in one cart/add.js items request when the companion should be added.
 */
(function (root) {
  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function optionName(option) {
    if (typeof option === 'string') return option;
    return option && option.name ? option.name : '';
  }

  function findOptionIndex(options, acceptedNames) {
    const accepted = acceptedNames.map(normalize);
    return (options || []).findIndex((option) => accepted.includes(normalize(optionName(option))));
  }

  function variantOptionValues(variant) {
    if (!variant) return [];
    if (Array.isArray(variant.options) && variant.options.length) return variant.options.slice();
    return [variant.option1, variant.option2, variant.option3].filter((value) => value != null && value !== '');
  }

  function isBundleVariant(variant, options) {
    const colorIndex = findOptionIndex(options, ['color', 'colour']);
    const sizeIndex = findOptionIndex(options, ['size']);
    if (colorIndex < 0 || sizeIndex < 0 || !variant) return false;
    const values = variantOptionValues(variant);
    return normalize(values[colorIndex]) === 'black' && normalize(values[sizeIndex]) === 'medium';
  }

  function findVariant(variants, selected) {
    return (
      (variants || []).find((variant) => {
        const values = variantOptionValues(variant);
        return (selected || []).every((value, index) => normalize(values[index]) === normalize(value));
      }) || null
    );
  }

  function isOptionValueAvailable(variants, optionIndex, value, selected) {
    return (variants || []).some((variant) => {
      if (!variant.available) return false;
      const values = variantOptionValues(variant);
      if (normalize(values[optionIndex]) !== normalize(value)) return false;
      return (selected || []).every((selectedValue, index) => {
        if (index === optionIndex) return true;
        return normalize(values[index]) === normalize(selectedValue);
      });
    });
  }

  function selectOption(product, selected, optionIndex, value) {
    const next = (selected || []).slice();
    next[optionIndex] = value;
    const exact = findVariant(product.variants, next);
    if (exact) return { selected: variantOptionValues(exact).slice(), variant: exact };

    const fallback =
      (product.variants || []).find((variant) => {
        const values = variantOptionValues(variant);
        return variant.available && normalize(values[optionIndex]) === normalize(value);
      }) ||
      (product.variants || []).find((variant) => {
        const values = variantOptionValues(variant);
        return normalize(values[optionIndex]) === normalize(value);
      });

    if (!fallback) return { selected: next, variant: null };
    return { selected: variantOptionValues(fallback).slice(), variant: fallback };
  }

  function selectJacketVariant(variants) {
    return (variants || []).find((variant) => variant.available) || null;
  }

  function cartHasVariant(cart, variantId) {
    const target = Number(variantId);
    return ((cart && cart.items) || []).some((item) => Number(item.variant_id || item.id) === target);
  }

  function sameProduct(product, jacket) {
    if (!product || !jacket) return false;
    if (product.id != null && jacket.id != null && Number(product.id) === Number(jacket.id)) return true;
    if (product.handle && jacket.handle && normalize(product.handle) === normalize(jacket.handle)) return true;
    if (product.title && jacket.title && normalize(product.title) === normalize(jacket.title)) return true;
    return false;
  }

  function quantityBounds(variant) {
    const rule = (variant && variant.quantity_rule) || {};
    const min = Math.max(1, Number(rule.min) || 1);
    const increment = Math.max(1, Number(rule.increment) || 1);
    let max = rule.max == null || rule.max === '' ? null : Number(rule.max);
    const tracked = Boolean(variant && variant.inventory_management) && variant.inventory_policy === 'deny';
    if (tracked && Number.isFinite(Number(variant.inventory_quantity))) {
      const stock = Math.max(0, Number(variant.inventory_quantity));
      max = max == null ? stock : Math.min(max, stock);
    }
    if (max == null || !Number.isFinite(max)) max = 99;
    return { min, max: Math.max(max, 0), increment };
  }

  function normalizeQuantity(value, bounds) {
    const limits = bounds || { min: 1, max: 99, increment: 1 };
    if (limits.max < limits.min) return limits.min;
    let quantity = Number.parseInt(value, 10);
    if (!Number.isFinite(quantity)) quantity = limits.min;
    const steps = Math.round((quantity - limits.min) / limits.increment);
    quantity = limits.min + Math.max(0, steps) * limits.increment;
    if (quantity > limits.max) {
      const maxSteps = Math.floor((limits.max - limits.min) / limits.increment);
      quantity = limits.min + Math.max(0, maxSteps) * limits.increment;
    }
    if (quantity < limits.min) quantity = limits.min;
    return quantity;
  }

  function formatMoney(cents, format) {
    if (cents == null || cents === '') return '';
    const amount = typeof cents === 'string' ? Number(cents.replace('.', '')) : Number(cents);
    if (!Number.isFinite(amount)) return '';

    function withDelimiters(number, precision, thousands, decimal) {
      const fixed = (number / 100).toFixed(precision);
      const parts = fixed.split('.');
      const dollars = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${thousands}`);
      return parts[1] ? `${dollars}${decimal}${parts[1]}` : dollars;
    }

    const pattern = /\{\{\s*(\w+)\s*\}\}/;
    const formatString = format || '${{amount}}';
    const token = (formatString.match(pattern) || [])[1] || 'amount';
    const values = {
      amount: withDelimiters(amount, 2, ',', '.'),
      amount_no_decimals: withDelimiters(amount, 0, ',', '.'),
      amount_with_comma_separator: withDelimiters(amount, 2, '.', ','),
      amount_no_decimals_with_comma_separator: withDelimiters(amount, 0, '.', ','),
      amount_with_apostrophe_separator: withDelimiters(amount, 2, "'", '.'),
      amount_no_decimals_with_space_separator: withDelimiters(amount, 0, ' ', '.'),
      amount_with_space_separator: withDelimiters(amount, 2, ' ', ','),
      amount_with_period_and_space_separator: withDelimiters(amount, 2, ' ', '.'),
    };
    return formatString.replace(pattern, values[token] != null ? values[token] : values.amount);
  }

  function localeRootFromCartUrl(cartUrl) {
    const clean = String(cartUrl || '/cart').replace(/\/$/, '');
    const withoutCart = clean.replace(/\/cart$/, '');
    if (!withoutCart) return '/';
    return withoutCart.endsWith('/') ? withoutCart : `${withoutCart}/`;
  }

  function jsonEndpoint(url) {
    const clean = String(url || '').replace(/\/$/, '');
    return clean.endsWith('.js') ? clean : `${clean}.js`;
  }

  function buildAddPlan({ product, variant, quantity, jacket, cart, cartChecked, jacketTitle }) {
    if (!variant || !variant.available) {
      return { items: [], jacketStatus: 'selected-unavailable' };
    }

    const items = [{ id: Number(variant.id), quantity }];
    if (!isBundleVariant(variant, product && product.options)) {
      return { items, jacketStatus: 'not-applicable' };
    }
    if (sameProduct(product, jacket || { title: jacketTitle })) {
      return { items, jacketStatus: 'same-product' };
    }
    if (cartChecked === false) {
      return { items, jacketStatus: 'cart-check-failed' };
    }
    if (!jacket) return { items, jacketStatus: 'missing' };

    const jacketVariant = selectJacketVariant(jacket.variants);
    if (!jacketVariant) return { items, jacketStatus: 'unavailable' };
    if (Number(jacketVariant.id) === Number(variant.id)) return { items, jacketStatus: 'same-product' };
    if (cartHasVariant(cart, jacketVariant.id)) return { items, jacketStatus: 'already-in-cart' };

    items.push({ id: Number(jacketVariant.id), quantity: 1 });
    return { items, jacketStatus: 'added', jacketVariantId: Number(jacketVariant.id) };
  }

  function normalizeRemoteProduct(product) {
    if (!product) return null;
    const options = (product.options || []).map((option, index) => {
      if (typeof option === 'string') return { name: option, position: index + 1, values: [] };
      return {
        name: option.name,
        position: option.position || index + 1,
        values: option.values || [],
      };
    });
    const variants = (product.variants || []).map((variant) => ({
      id: variant.id,
      available: Boolean(variant.available),
      price: variant.price,
      options: [variant.option1, variant.option2, variant.option3].filter((value) => value != null && value !== ''),
      inventory_management: variant.inventory_management,
      inventory_policy: variant.inventory_policy,
      inventory_quantity: variant.inventory_quantity,
    }));
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      options,
      variants,
    };
  }

  const api = {
    normalize,
    findOptionIndex,
    variantOptionValues,
    isBundleVariant,
    findVariant,
    isOptionValueAvailable,
    selectOption,
    selectJacketVariant,
    cartHasVariant,
    sameProduct,
    quantityBounds,
    normalizeQuantity,
    formatMoney,
    localeRootFromCartUrl,
    jsonEndpoint,
    buildAddPlan,
    normalizeRemoteProduct,
  };

  function bootPopup() {
    if (!root.customElements || root.customElements.get('product-popup')) return;

    class ProductPopup extends HTMLElement {
      connectedCallback() {
        this.dialog = this.querySelector('[data-popup-dialog]');
        this.form = this.querySelector('[data-popup-form]');
        this.config = this.readConfig();
        this.jacket = this.readJacket();
        this.pending = false;
        this.onClick = this.onClick.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onDialogClose = this.onDialogClose.bind(this);
        this.onDialogClick = this.onDialogClick.bind(this);
        this.onQuantityInput = this.onQuantityInput.bind(this);
        this.addEventListener('click', this.onClick);
        this.form?.addEventListener('submit', this.onSubmit);
        this.form?.addEventListener('change', this.onQuantityInput);
        this.dialog?.addEventListener('close', this.onDialogClose);
        this.dialog?.addEventListener('click', this.onDialogClick);
      }

      disconnectedCallback() {
        this.removeEventListener('click', this.onClick);
        this.form?.removeEventListener('submit', this.onSubmit);
        this.form?.removeEventListener('change', this.onQuantityInput);
        this.dialog?.removeEventListener('close', this.onDialogClose);
        this.dialog?.removeEventListener('click', this.onDialogClick);
        if (this.dialog?.open) this.unlockScroll();
      }

      readConfig() {
        const node = this.querySelector('[data-popup-config]');
        if (!node) return { messages: {} };
        try {
          return JSON.parse(node.textContent);
        } catch (error) {
          return { messages: {} };
        }
      }

      readJacket() {
        const node = this.querySelector('[data-gift-jacket]');
        if (!node) return null;
        try {
          const parsed = JSON.parse(node.textContent);
          return parsed && parsed.id ? parsed : null;
        } catch (error) {
          return null;
        }
      }

      open(product, opener) {
        if (!this.dialog || !product) return;
        this.product = product;
        this.opener = opener || document.activeElement;
        const initial = (product.variants || []).find((variant) => variant.available) || (product.variants || [])[0] || null;
        this.variant = initial;
        this.selected = initial ? api.variantOptionValues(initial).slice() : [];
        const bounds = api.quantityBounds(initial);
        this.quantity = bounds.min;
        this.render();
        this.setStatus('', '');
        this.lockScroll();
        if (!this.dialog.open) this.dialog.showModal();
        this.querySelector('[data-popup-close]')?.focus();
      }

      close() {
        if (this.dialog?.open) this.dialog.close();
      }

      onDialogClose() {
        this.unlockScroll();
        this.pending = false;
        if (this.opener && typeof this.opener.focus === 'function') this.opener.focus();
      }

      onDialogClick(event) {
        if (event.target === this.dialog) this.close();
      }

      onClick(event) {
        if (event.target.closest('[data-popup-close]')) {
          event.preventDefault();
          this.close();
          return;
        }

        const optionButton = event.target.closest('[data-option-index]');
        if (optionButton && this.contains(optionButton) && !optionButton.disabled) {
          const optionIndex = Number(optionButton.dataset.optionIndex);
          const result = api.selectOption(this.product, this.selected, optionIndex, optionButton.dataset.optionValue);
          this.selected = result.selected;
          this.variant = result.variant;
          this.quantity = api.quantityBounds(this.variant).min;
          this.render();
          const nextButton = this.querySelector(
            `[data-option-index="${optionIndex}"][data-option-value="${cssEscape(optionButton.dataset.optionValue)}"]`
          );
          nextButton?.focus();
          return;
        }

        if (event.target.closest('[data-qty-minus]')) {
          event.preventDefault();
          this.stepQuantity(-1);
        }
        if (event.target.closest('[data-qty-plus]')) {
          event.preventDefault();
          this.stepQuantity(1);
        }
      }

      onQuantityInput(event) {
        if (!event.target.matches('[data-qty-input]')) return;
        this.quantity = api.normalizeQuantity(event.target.value, api.quantityBounds(this.variant));
        event.target.value = String(this.quantity);
      }

      stepQuantity(direction) {
        const bounds = api.quantityBounds(this.variant);
        this.quantity = api.normalizeQuantity(this.quantity + direction * bounds.increment, bounds);
        const input = this.querySelector('[data-qty-input]');
        if (input) input.value = String(this.quantity);
      }

      async onSubmit(event) {
        event.preventDefault();
        if (this.pending) return;
        if (!this.variant || !this.variant.available) {
          this.setStatus(this.message('unavailable', 'This variant is unavailable.'), 'error');
          return;
        }

        this.pending = true;
        this.setLoading(true);
        this.setStatus('', '');

        try {
          const wantsBundle = api.isBundleVariant(this.variant, this.product.options);
          let jacket = this.jacket;
          let cart = null;
          let cartChecked = true;

          if (wantsBundle && !jacket) {
            try {
              jacket = await this.findJacket();
              if (jacket) this.jacket = jacket;
            } catch (error) {
              jacket = null;
            }
          }
          if (wantsBundle) {
            try {
              cart = await this.fetchCart();
            } catch (error) {
              cartChecked = false;
            }
          }

          const bounds = api.quantityBounds(this.variant);
          const quantity = api.normalizeQuantity(this.quantity, bounds);
          this.quantity = quantity;
          const plan = api.buildAddPlan({
            product: this.product,
            variant: this.variant,
            quantity,
            jacket,
            cart,
            cartChecked,
            jacketTitle: this.config.jacketTitle,
          });

          if (!plan.items.length) {
            this.setStatus(this.message('unavailable', 'This variant is unavailable.'), 'error');
            return;
          }

          let response;
          let jacketStatus = plan.jacketStatus;
          try {
            response = await this.addItems(plan.items);
          } catch (error) {
            if (plan.items.length > 1) {
              response = await this.addItems([plan.items[0]]);
              jacketStatus = 'unavailable';
            } else {
              throw error;
            }
          }

          this.refreshCart(response);
          const partial = jacketStatus === 'missing' || jacketStatus === 'unavailable' || jacketStatus === 'cart-check-failed';
          this.setStatus(this.successMessage(jacketStatus), partial ? 'warning' : 'success');
        } catch (error) {
          this.setStatus(error && error.message ? error.message : this.message('error', 'Could not add this product to the cart.'), 'error');
        } finally {
          this.pending = false;
          this.setLoading(false);
        }
      }

      successMessage(status) {
        const messages = {
          added: this.message('bundleAdded', 'Added to cart. Soft Winter Jacket was added with this item.'),
          'already-in-cart': this.message('bundleAlready', 'Added to cart. Soft Winter Jacket is already in your cart.'),
          missing: this.message('bundleMissing', 'Added to cart. Soft Winter Jacket could not be found, so it was not added.'),
          unavailable: this.message('bundleUnavailable', 'Added to cart. Soft Winter Jacket is unavailable and was not added.'),
          'cart-check-failed': this.message('bundleCart', 'Added to cart. Soft Winter Jacket was not added because the cart could not be checked.'),
          'not-applicable': this.message('added', 'Added to cart.'),
          'same-product': this.message('added', 'Added to cart.'),
        };
        return messages[status] || this.message('added', 'Added to cart.');
      }

      message(key, fallback) {
        return (this.config.messages && this.config.messages[key]) || fallback;
      }

      async findJacket() {
        const title = this.config.jacketTitle || 'Soft Winter Jacket';
        const rootUrl = api.localeRootFromCartUrl(this.config.cartUrl);
        const endpoint = `${rootUrl}search/suggest.json?q=${encodeURIComponent(title)}&resources[type]=product&resources[limit]=10&resources[options][fields]=title`;
        const search = await this.fetchJson(endpoint);
        const products = search?.resources?.results?.products || [];
        const match = products.find((product) => api.normalize(product.title) === api.normalize(title));
        if (!match?.handle) return null;
        const product = await this.fetchJson(`${rootUrl}products/${encodeURIComponent(match.handle)}.js`);
        const normalized = api.normalizeRemoteProduct(product);
        if (!normalized || api.normalize(normalized.title) !== api.normalize(title)) return null;
        return normalized;
      }

      async fetchCart() {
        return this.fetchJson(api.jsonEndpoint(this.config.cartUrl || '/cart'));
      }

      async addItems(items) {
        const { sections } = this.cartSections();
        const payload = { items };
        if (sections) {
          payload.sections = sections;
          payload.sections_url = root.location ? root.location.pathname : '/';
        }
        return this.fetchJson(api.jsonEndpoint(this.config.cartAddUrl || '/cart/add'), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(payload),
        });
      }

      cartSections() {
        const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        if (!cart || typeof cart.getSectionsToRender !== 'function') return { cart, sections: '' };
        const sections = cart
          .getSectionsToRender()
          .map((section) => section.id)
          .filter(Boolean)
          .join(',');
        return { cart, sections };
      }

      refreshCart(response) {
        const { cart } = this.cartSections();
        const line = Array.isArray(response.items) ? response.items[0] : response;
        const state = {
          id: line && (line.id || line.variant_id),
          key: line && line.key,
          sections: response.sections || (line && line.sections) || {},
        };

        try {
          if (cart && typeof cart.renderContents === 'function' && state.sections && Object.keys(state.sections).length) {
            if (cart.classList?.contains('is-empty')) cart.classList.remove('is-empty');
            cart.setActiveElement?.(this.opener);
            cart.renderContents(state);
          } else if (typeof root.publish === 'function' && root.PUB_SUB_EVENTS) {
            root.publish(root.PUB_SUB_EVENTS.cartUpdate, { source: 'gift-guide', cartData: response });
          }
        } catch (error) {
          console.error(error);
        }
      }

      async fetchJson(url, options) {
        let response;
        try {
          response = await fetch(url, options);
        } catch (error) {
          const failure = new Error(this.message('error', 'Network error. Please try again.'));
          failure.cause = error;
          throw failure;
        }

        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = null;
        }

        if (!response.ok || (data && Number(data.status) >= 400)) {
          const failure = new Error((data && (data.description || data.message)) || this.message('error', 'Could not add this product to the cart.'));
          failure.payload = data;
          throw failure;
        }
        return data;
      }

      render() {
        const product = this.product || {};
        const variant = this.variant;
        const bounds = api.quantityBounds(variant);
        this.quantity = api.normalizeQuantity(this.quantity || bounds.min, bounds);

        const title = this.querySelector('[data-popup-title]');
        if (title) title.textContent = product.title || '';

        const price = this.querySelector('[data-popup-price]');
        if (price) {
          price.replaceChildren();
          if (variant) {
            const current = document.createElement('span');
            current.textContent = api.formatMoney(variant.price, this.config.moneyFormat);
            price.append(current);
            if (variant.compare_at_price && Number(variant.compare_at_price) > Number(variant.price)) {
              const compare = document.createElement('s');
              compare.textContent = api.formatMoney(variant.compare_at_price, this.config.moneyFormat);
              price.append(compare);
            }
          }
        }

        const description = this.querySelector('[data-popup-description]');
        if (description) {
          description.replaceChildren();
          if (product.description) {
            const template = document.createElement('template');
            template.innerHTML = product.description;
            template.content.querySelectorAll('script, iframe, object, embed').forEach((node) => node.remove());
            description.append(template.content);
          }
        }

        const image = this.querySelector('[data-popup-image]');
        const imageWrap = this.querySelector('[data-popup-media]');
        const imageSrc = (variant && variant.featured_image) || product.featured_image || '';
        if (image && imageWrap) {
          if (imageSrc) {
            image.src = imageSrc;
            image.alt = product.title || '';
            image.hidden = false;
            imageWrap.classList.remove('is-empty');
          } else {
            image.removeAttribute('src');
            image.alt = '';
            image.hidden = true;
            imageWrap.classList.add('is-empty');
          }
        }

        const options = this.querySelector('[data-popup-options]');
        if (options) {
          options.replaceChildren();
          (product.options || []).forEach((option, optionIndex) => {
            if (normalizeTitleOption(option, product)) return;
            const field = document.createElement('fieldset');
            field.className = 'gift-popup__option';
            const legend = document.createElement('legend');
            legend.textContent = optionName(option);
            field.append(legend);
            const values = document.createElement('div');
            values.className = 'gift-popup__values';
            (option.values || []).forEach((value) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'gift-popup__value';
              button.dataset.optionIndex = String(optionIndex);
              button.dataset.optionValue = value;
              button.textContent = value;
              const selected = api.normalize(this.selected[optionIndex]) === api.normalize(value);
              const available = api.isOptionValueAvailable(product.variants, optionIndex, value, this.selected);
              button.setAttribute('aria-pressed', selected ? 'true' : 'false');
              button.disabled = !available;
              values.append(button);
            });
            field.append(values);
            options.append(field);
          });
        }

        const availability = this.querySelector('[data-popup-availability]');
        if (availability) {
          if (!variant) {
            availability.textContent = this.message('unavailable', 'Unavailable');
            availability.dataset.state = 'error';
          } else if (!variant.available || bounds.max < bounds.min) {
            availability.textContent = this.message('soldOut', 'Sold out');
            availability.dataset.state = 'error';
          } else {
            availability.textContent = this.message('inStock', 'In stock');
            availability.dataset.state = 'ok';
          }
        }

        const input = this.querySelector('[data-qty-input]');
        if (input) {
          input.min = String(bounds.min);
          input.max = String(Math.max(bounds.min, bounds.max));
          input.step = String(bounds.increment);
          input.value = String(this.quantity);
          input.disabled = !variant || !variant.available;
        }
        this.querySelectorAll('[data-qty-minus], [data-qty-plus]').forEach((button) => {
          button.disabled = !variant || !variant.available;
        });

        const bundle = this.querySelector('[data-popup-bundle]');
        if (bundle) {
          const showBundle = api.isBundleVariant(variant, product.options) && !api.sameProduct(product, { title: this.config.jacketTitle, id: this.jacket && this.jacket.id, handle: this.jacket && this.jacket.handle });
          bundle.hidden = !showBundle;
          bundle.textContent = showBundle ? this.message('bundleNotice', 'Black / Medium includes a Soft Winter Jacket.') : '';
        }

        const submit = this.querySelector('[data-popup-submit]');
        if (submit && !this.pending) {
          const label = submit.querySelector('[data-popup-submit-label]');
          const canBuy = Boolean(variant && variant.available && bounds.max >= bounds.min);
          submit.disabled = !canBuy;
          if (label) {
            if (!variant) label.textContent = this.message('unavailable', 'Unavailable');
            else if (!canBuy) label.textContent = this.message('soldOut', 'Sold out');
            else label.textContent = this.message('add', 'Add to cart');
          }
        }
      }

      setLoading(isLoading) {
        const submit = this.querySelector('[data-popup-submit]');
        if (!submit) return;
        submit.classList.toggle('is-loading', isLoading);
        submit.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        if (isLoading) submit.disabled = true;
        else this.render();
      }

      setStatus(message, state) {
        const status = this.querySelector('[data-popup-status]');
        if (!status) return;
        status.textContent = message || '';
        status.dataset.state = state || '';
      }

      lockScroll() {
        const scrollbar = root.innerWidth - root.document.documentElement.clientWidth;
        root.document.documentElement.style.overflow = 'hidden';
        root.document.body.style.overflow = 'hidden';
        if (scrollbar > 0) root.document.body.style.paddingRight = `${scrollbar}px`;
      }

      unlockScroll() {
        root.document.documentElement.style.overflow = '';
        root.document.body.style.overflow = '';
        root.document.body.style.paddingRight = '';
      }
    }

    function cssEscape(value) {
      if (root.CSS && typeof root.CSS.escape === 'function') return root.CSS.escape(value);
      return String(value).replace(/"/g, '\\"');
    }

    function normalizeTitleOption(option, product) {
      const values = option.values || [];
      return values.length === 1 && api.normalize(values[0]) === 'default title' && (product.options || []).length === 1;
    }

    root.customElements.define('product-popup', ProductPopup);
  }

  if (typeof root.window !== 'undefined' || typeof root.document !== 'undefined') {
    root.GiftGuideLogic = api;
    bootPopup();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

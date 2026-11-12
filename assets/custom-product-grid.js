(function () {
  if (customElements.get('gift-product-grid')) return;

  class GiftProductGrid extends HTMLElement {
    connectedCallback() {
      this.onClick = this.onClick.bind(this);
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
    }

    onClick(event) {
      const trigger = event.target.closest('[data-gift-open]');
      if (!trigger || !this.contains(trigger)) return;

      const popup = this.querySelector('product-popup');
      const productId = trigger.getAttribute('data-gift-open');
      const source = Array.from(this.querySelectorAll('[data-gift-product]')).find(
        (node) => node.getAttribute('data-gift-product') === productId
      );
      if (!popup || !source || typeof popup.open !== 'function') return;

      try {
        popup.open(JSON.parse(source.textContent), trigger);
      } catch (error) {
        console.error(error);
      }
    }
  }

  customElements.define('gift-product-grid', GiftProductGrid);
})();

(function () {
  if (customElements.get('gift-guide-banner')) return;

  class GiftGuideBanner extends HTMLElement {
    connectedCallback() {
      this.querySelectorAll('.gift-banner__button').forEach((button) => {
        if (button.dataset.enhanced === 'true') return;
        button.dataset.enhanced = 'true';

        const label = button.querySelector('.gift-banner__button-label');
        if (!label || label.querySelector('[aria-hidden="true"]')) return;

        const text = label.textContent.trim();
        label.textContent = '';
        const visible = document.createElement('span');
        visible.textContent = text;
        const duplicate = document.createElement('span');
        duplicate.textContent = text;
        duplicate.setAttribute('aria-hidden', 'true');
        label.append(visible, duplicate);
      });
    }
  }

  customElements.define('gift-guide-banner', GiftGuideBanner);
})();

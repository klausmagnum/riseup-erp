/**
 * Integração RiseUP NFSe Sync com ERP
 * Abre o side panel da extensão no ERP
 */

const EXTENSION_ID = 'dbdeemgdmgeokjhimkfbhikcfdlmkied';

window.RiseUPNFSe = {
  /**
   * Abre o side panel da extensão na aba atual
   */
  abrirSidePanel: function() {
    console.log('[RiseUP NFSe] Abrindo side panel na aba atual...');

    // Enviar mensagem para a extensão abrir o side panel
    chrome.runtime.sendMessage(
      EXTENSION_ID,
      { action: 'abrirSidePanel' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[RiseUP NFSe] Erro:', chrome.runtime.lastError.message);
          alert('Extensão RiseUP NFSe Sync não está instalada!');
        } else {
          console.log('[RiseUP NFSe] ✓ Side panel aberto!');
        }
      }
    );
  },

  /**
   * Abre o side panel (alias para compatibilidade)
   */
  abrirRecebidas: function() {
    this.abrirSidePanel();
  },

  /**
   * Abre o side panel (alias para compatibilidade)
   */
  abrirEmitidas: function() {
    this.abrirSidePanel();
  }
};

console.log('[RiseUP NFSe] ✓ Integração carregada');

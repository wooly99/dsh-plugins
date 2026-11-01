window.__ModuleLoader__.load({
  id: '@local/dsh-rightbar-middle-close',
  factory() {
    /**
     * Tab chips of the right Sidebar are the pane strip's `role="tab"`
     * controls; the cell that carries the tab's identity is marked
     * `data-sidebar-right-tab` by `@deepseek-ai/dsh-client-ui-sidebar-right`.
     */
    const TAB_CHIP = '[role="tab"]'
    const TAB_MARKER = '[data-sidebar-right-tab]'

    /** Every right Sidebar subtree (docked column and floating panels) sits under this root marker. */
    const SESSION_ROOT = '[data-sidebar-right-session]'

    /**
     * The right Sidebar tab a pointer landed on.
     *
     * The tab id is read from the chip, never from the surrounding pane: a tab
     * body carries the same marker, so only a chip (or something inside one)
     * may answer here.
     * @param {EventTarget | null} target - target of a mouse event.
     * @returns {string | undefined} the tab id, or undefined outside a chip.
     */
    function tabIdAt(target) {
      if (!(target instanceof Element)) return undefined
      const chip = target.closest(TAB_CHIP)
      if (chip === null || chip.closest(SESSION_ROOT) === null) return undefined
      const marker = chip.matches(TAB_MARKER) ? chip : chip.querySelector(TAB_MARKER)
      const id = chip.dataset.sidebarRightTab ?? chip.dataset.dockkitTab ?? marker?.dataset.sidebarRightTab
      return typeof id === 'string' && id !== '' ? id : undefined
    }

    /**
     * Whether an event is a middle-button gesture on a right Sidebar tab chip.
     * @param {MouseEvent} event - mouse event from the page.
     * @returns {boolean} true when this gesture belongs to a tab chip.
     */
    function onTabChip(event) {
      return event.button === 1 && tabIdAt(event.target) !== undefined
    }

    return {
      /** The right Sidebar's navigation face; the browser half stays inactive without it. */
      inject: ['sidebarRight'],

      /**
       * Install the middle-button tab close over the right Sidebar.
       * @param {object} ctx - Client plugin context carrying `sidebarRight`.
       */
      apply(ctx) {
        /**
         * Keep the middle button from starting Chromium's autoscroll on a chip.
         * @param {MouseEvent} event - capture-phase mousedown.
         */
        function onMouseDown(event) {
          if (!onTabChip(event)) return
          event.preventDefault()
        }

        /**
         * Close the chip's tab exactly as its × control does: one call into the
         * column's own controller, which runs the tab type's close handler,
         * leaves a sole guide tab in place, and collapses the column when the
         * closed tab was the last one.
         * @param {MouseEvent} event - capture-phase auxclick.
         */
        function onAuxClick(event) {
          if (event.button !== 1) return
          const tabId = tabIdAt(event.target)
          if (tabId === undefined) return
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          try {
            ctx.sidebarRight.close(tabId)
          } catch (error) {
            console.warn('[rightbar-middle-close] could not close the tab:', error)
          }
        }

        ctx.effect(() => {
          document.addEventListener('mousedown', onMouseDown, true)
          document.addEventListener('auxclick', onAuxClick, true)
          return () => {
            document.removeEventListener('mousedown', onMouseDown, true)
            document.removeEventListener('auxclick', onAuxClick, true)
          }
        }, 'rightbar-middle-close: middle-button tab close')
      },
    }
  },
})

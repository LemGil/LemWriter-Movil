import { Blockquote } from '@tiptap/extension-blockquote'

export type TipoNotaMinisterial = 'biblia' | 'idea' | 'aplicacion' | 'nota'

export const CustomBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      calloutType: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          return (
            element.getAttribute('data-callout-type') ||
            (element.classList.contains('callout-biblia')
              ? 'biblia'
              : element.classList.contains('callout-idea')
              ? 'idea'
              : element.classList.contains('callout-aplicacion')
              ? 'aplicacion'
              : element.classList.contains('callout-nota')
              ? 'nota'
              : null)
          )
        },
        renderHTML: (attributes: { calloutType?: string | null }) => {
          if (!attributes.calloutType) return {}
          return {
            'data-callout-type': attributes.calloutType,
            class: `callout callout-${attributes.calloutType}`,
          }
        },
      },
    }
  },
})

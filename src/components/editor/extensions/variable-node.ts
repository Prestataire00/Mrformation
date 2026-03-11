import { Node, mergeAttributes } from "@tiptap/core";

export interface VariableNodeOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variableNode: {
      insertVariable: (name: string) => ReturnType;
    };
  }
}

export const VariableNode = Node.create<VariableNodeOptions>({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-variable"),
        renderHTML: (attributes) => ({
          "data-variable": attributes.name,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-variable]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-variable": node.attrs.name,
        class: "variable-chip",
      }),
      `{{${node.attrs.name}}}`,
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },

  addCommands() {
    return {
      insertVariable:
        (name: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { name },
          });
        },
    };
  },
});

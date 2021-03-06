import { Component, key } from "can";
import CodeMirror from "codemirror";
import esprima from "esprima";
import escodegen from "escodegen";
import "codemirror/mode/javascript/javascript";
import "./code-editor.less"

Component.extend({
  tag: "code-editor",

  view: `
    <h2 class="center">ViewModel</h2>
    <textarea value:bind="source"></textarea>
  `,

  ViewModel: {
    connectedCallback(el) {
      const textarea = el.querySelector("textarea");

      const editor = CodeMirror.fromTextArea(
        textarea,
        {
          lineNumbers: true,
          // make textarea grow infinitely
          viewportMargin: Infinity,
          mode: { name: "javascript" }
        }
      );

      const changeHandler = () => {
        const val = editor.getValue();
        this.source = val;
      };

      editor.on("change", changeHandler);

      return () => {
        editor.off("change", changeHandler);
      };
    },

    source: {
      value({ resolve, listenTo, lastSet }) {
        let timeoutId = null;

        let latest = [
          "import { DefineMap } from \"can\";",
          "",
          "const ViewModel = DefineMap.extend({",
          "  first: { default: \"Kevin\" },",
          "  last: { default: \"McCallister\" },",
          "  get name() { return `${this.first} ${this.last}`; }",
          "});"
        ].join("\n");

        const update = () => {
          resolve(latest);
        };

        listenTo(lastSet, (val) => {
          clearTimeout(timeoutId);
          latest = val;
          // only update source if it hasn't been set for... some time
          timeoutId = setTimeout(update, 500);
        });

        // set the default source
        resolve(latest);
      }
    },

    ast: {
      value({ listenTo, resolve }) {
        const update = () => {
          try {
            const ast = esprima.parse(this.source, {
              sourceType: "module"
            });

            resolve(ast);
          } catch(e) {
            // if parsing throws, fail silently
            // the user probably isn't done typing
            // console.info("parsing AST failed", e);
          }
        };
        listenTo("source", update);
        update();
      }
    },

    get propDefinitions() {
      const props = key.get(
        this.ast,
        "body[1].declarations[0].init.arguments[0]"
      );

      return escodegen.generate(props);
    },

    get canDependencies() {
      const specifiers = key.get(
        this.ast,
        "body[0].specifiers"
      );

      return specifiers.map((specifier) => {
        return specifier.imported.name;
      });
    },

    ViewModel: {
      value({ listenTo, resolve }) {
        let canDependencies = "DefineMap";

        listenTo("canDependencies", (ev, newVal) => {
          canDependencies = newVal;
        });

        const update = () => {
          try {
            const makeConstructor = new Function(`
              return import("//unpkg.com/can@5/everything.mjs")
                .then((module) => {
                  const { ${canDependencies} } = module;

                  return DefineMap.extend(${this.propDefinitions});
                });
            `);

            makeConstructor()
              .then((VM) => {
                resolve( VM );
              });
          } catch(e) {
            // if creating constructor throws, fail silently
            // the user probably isn't done typing
            // ie user is in the middle of typing a property name
            // `fo`
            // console.info("Creating VM failed", e);
          }
        };

        listenTo("propDefinitions", update);

        update();
      }
    }
  }
});

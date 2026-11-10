import { DynamicSnippet } from "./dynamic_snippet";
import { registry } from "@web/core/registry";

const DynamicSnippetEdit = (I) =>
    class extends I {
        setup() {
            super.setup();
            this.withSample = true;
        }

        start() {
            // The product page's alternative products have no content section.
            const contentEl = this.el.querySelector(".s_dynamic_snippet_content");
            if (
                contentEl &&
                !this.data.length &&
                !this.el.querySelector(".missing_option_warning")
            ) {
                this.renderAt(
                    "website.s_dynamic_snippet.missing_option_warning",
                    {},
                    contentEl,
                    "afterbegin"
                );
            }
            super.start();
        }
    };

registry.category("public.interactions.edit").add("website.dynamic_snippet", {
    Interaction: DynamicSnippet,
    mixin: DynamicSnippetEdit,
});

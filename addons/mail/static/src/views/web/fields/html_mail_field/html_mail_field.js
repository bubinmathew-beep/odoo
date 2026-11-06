import { HtmlField, htmlField } from "@html_editor/fields/html_field";
import { registry } from "@web/core/registry";
import { getCSSRules, toInline } from "./convert_inline";
import { ColumnPlugin } from "@html_editor/main/column_plugin";
import { backgroundImageCssToParts } from "@html_editor/utils/image";
import { loadImageInfo } from "@html_editor/utils/image_processing";

const cssRulesByElement = new WeakMap();

export class HtmlMailField extends HtmlField {
    /**
     * Turns the webp images into png ones saved by `savePendingImages`, as
     * most mail clients cannot display webp.
     *
     * @param {HTMLElement} element
     */
    static async convertWebpImages(element) {
        const selector = 'img[src*=".webp"], [style*="background-image"][style*=".webp"]';
        for (const el of element.querySelectorAll(selector)) {
            const isBackground = !el.matches("img");
            const src = isBackground
                ? backgroundImageCssToParts(el.style.backgroundImage).url?.slice(5, -2)
                : el.getAttribute("src");
            // Keep the images from other sites, the browser cannot read them back.
            if (new URL(src, window.location.href).origin !== window.location.origin) {
                continue;
            }
            await loadImageInfo(el, src);
            const { originalId, mimetype, mimetypeBeforeConversion } = el.dataset;
            // Keep the format picked in the image options.
            if (mimetype && mimetype !== "image/webp" && mimetype !== mimetypeBeforeConversion) {
                continue;
            }
            // Only an img can be saved as a new attachment.
            if (!originalId && isBackground) {
                continue;
            }
            let dataURL;
            try {
                const image = new Image();
                image.src = src;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext("2d").drawImage(image, 0, 0);
                dataURL = canvas.toDataURL("image/png");
            } catch {
                // Keep the images that the browser cannot load or read back.
                continue;
            }
            el.dataset.mimetype = "image/png";
            el.dataset.fileName = "image.png";
            if (isBackground) {
                el.dataset.bgSrc = dataURL;
            } else {
                el.setAttribute("src", dataURL);
            }
            el.classList.add(originalId ? "o_modified_image_to_save" : "o_b64_image_to_save");
        }
    }

    /**
     * @param {WeakMap} cssRulesByElement
     * @param {Editor} editor
     * @param {HTMLElement} el
     */
    static async getInlinedEditorContent(cssRulesByElement, editor, el) {
        if (!cssRulesByElement.has(editor.editable)) {
            cssRulesByElement.set(editor.editable, getCSSRules(editor.document));
        }
        const cssRules = cssRulesByElement.get(editor.editable);
        // Insert the cloned element inside an DOM so we can get its computed style.
        editor.editable.after(el);
        el.classList.remove("odoo-editor-editable");
        // Wait for the images to load so that their size can be inlined.
        await Promise.all(
            [...el.querySelectorAll("img")].map((img) => img.decode().catch(() => {}))
        );
        await toInline(el, cssRules);
        el.remove();
    }

    async getEditorContent() {
        await HtmlMailField.convertWebpImages(this.editor.editable);
        // Save the images in place, as `super` only syncs the src of the img back.
        await this.editor.shared.media?.savePendingImages(this.editor.editable);
        const el = await super.getEditorContent();
        await HtmlMailField.getInlinedEditorContent(cssRulesByElement, this.editor, el);
        return el;
    }

    getConfig() {
        const config = super.getConfig();
        config.dropImageAsAttachment = false;
        config.Plugins = config.Plugins.filter((plugin) => plugin !== ColumnPlugin);
        return config;
    }
}

export const htmlMailField = {
    ...htmlField,
    component: HtmlMailField,
    additionalClasses: ["o_field_html"],
    extractProps({ attrs, options }, dynamicInfo) {
        const props = htmlField.extractProps({ attrs, options }, dynamicInfo);
        props.embeddedComponents = false;
        return props;
    },
};

registry.category("fields").add("html_mail", htmlMailField);

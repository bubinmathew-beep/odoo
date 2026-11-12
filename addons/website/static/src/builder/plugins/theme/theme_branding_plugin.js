import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { signal, usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { TitlePlugin } from "@web/core/browser/title_plugin";
import { shallowEqual } from "@web/core/utils/objects";
import {
    HEADER_LOGO_SELECTOR,
    applyLogo,
    createFaviconPreview,
    createTitlePreview,
} from "./theme_branding_utils";

const UNCROPPED_MIMETYPES = ["image/svg+xml", "image/webp", "image/gif"];

const FIELD_ERROR_MESSAGES = {
    name: (reason) => _t("The website name could not be saved: %s", reason),
    favicon: (reason) => _t("The favicon could not be saved: %s", reason),
    logo: (reason) => _t("The logo could not be saved: %s", reason),
};

class SetWebsiteNameAction extends BuilderAction {
    static id = "setWebsiteName";
    static dependencies = ["themeBranding"];

    getValue() {
        return this.dependencies.themeBranding.getDisplayedWebsiteName();
    }

    apply({ value }) {
        this.dependencies.themeBranding.setWebsiteName(value);
    }
}

class RemoveFaviconAction extends BuilderAction {
    static id = "removeFavicon";
    static dependencies = ["themeBranding"];

    apply() {
        this.dependencies.themeBranding.removeFavicon();
    }
}

class BaseReplaceImageAction extends BuilderAction {
    static dependencies = ["themeBranding"];

    setup() {
        // Picking an image can take longer than the action timeout.
        this.canTimeout = false;
    }
}

class ReplaceFaviconAction extends BaseReplaceImageAction {
    static id = "replaceFavicon";

    apply() {
        return this.dependencies.themeBranding.replaceFavicon();
    }
}

class ReplaceLogoAction extends BaseReplaceImageAction {
    static id = "replaceLogo";

    apply() {
        return this.dependencies.themeBranding.replaceLogo();
    }
}

export class ThemeBrandingPlugin extends Plugin {
    static id = "themeBranding";
    static dependencies = ["media", "domObserver"];
    static shared = [
        "getDisplayedWebsiteName",
        "getSavedWebsiteName",
        "getDisplayedFavicon",
        "checkSavedFavicon",
        "setWebsiteName",
        "replaceFavicon",
        "removeFavicon",
        "replaceLogo",
    ];
    resources = {
        builder_actions: {
            SetWebsiteNameAction,
            ReplaceFaviconAction,
            RemoveFaviconAction,
            ReplaceLogoAction,
        },
        on_ready_to_save_document_handlers: () => this.saveBranding(),
    };

    /**
     * saved: what the server has (`hasFavicon` is null until checked).
     * staged: the changed fields only (a removed favicon is false).
     * displayed: what the option and the browser tab show.
     */
    setup() {
        const website = this.services.website.currentWebsite;
        this.websiteId = website.id;
        this.saved = { name: signal(website.name || ""), hasFavicon: null };
        this.savedFaviconVersion = Date.now();
        this.staged = {};
        this.displayed = { name: this.saved.name(), favicon: signal(null) };
        this.titlePreview = createTitlePreview(usePlugin(TitlePlugin), this.document);
        this.faviconPreview = createFaviconPreview();
        this.faviconCheck = null;
    }

    destroy() {
        this.faviconPreview.reset();
        super.destroy();
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    getDisplayedWebsiteName() {
        return this.displayed.name;
    }

    getSavedWebsiteName() {
        return this.saved.name();
    }

    /**
     * @returns {{url: string, cropToSquare: boolean}|null}
     */
    getDisplayedFavicon() {
        return this.displayed.favicon();
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    setWebsiteName(value) {
        value = value.trim();
        this.stageChange(() => {
            if (value === this.saved.name()) {
                delete this.staged.name;
            } else {
                this.staged.name = value;
            }
        });
    }

    async replaceFavicon() {
        await this.openImageDialog((mediaData) => {
            this.stageChange(() => {
                this.staged.favicon = mediaData;
            });
        });
    }

    removeFavicon() {
        this.stageChange(() => {
            this.staged.favicon = false;
        });
    }

    async replaceLogo() {
        await this.openImageDialog((mediaData) => {
            this.stageChange(() => {
                applyLogo(this.document, mediaData.img);
                this.staged.logo = mediaData;
            });
        });
    }

    async openImageDialog(onSelect) {
        await this.dependencies.media.openMediaDialog({
            resModel: "website",
            resId: this.websiteId,
            onlyImages: true,
            useMediaLibrary: false,
            save: (img, selectedMedia) => {
                if (selectedMedia[0]?.type === "url") {
                    this.services.notification.add(
                        _t(
                            "This image is only a link to another website. Please upload the file instead."
                        ),
                        { type: "warning" }
                    );
                    return;
                }
                onSelect({
                    attachmentId: parseInt(img.dataset.attachmentId, 10),
                    mimetype: selectedMedia[0].mimetype,
                    img,
                });
            },
        });
    }

    // -------------------------------------------------------------------------
    // History and preview
    // -------------------------------------------------------------------------

    /**
     * Makes `change` one undo step. It edits `this.staged` and, for the logo,
     * the page.
     *
     * @param {Function} change
     */
    stageChange(change) {
        const before = { ...this.staged };
        change();
        const after = { ...this.staged };
        if (shallowEqual(before, after)) {
            return;
        }
        this.setStagedAndPreview(after);
        this.dependencies.domObserver.stageCustomMutation({
            apply: () => this.setStagedAndPreview(after),
            revert: () => this.setStagedAndPreview(before),
        });
    }

    isStaged(field) {
        return field in this.staged;
    }

    setStagedAndPreview(staged) {
        this.staged = { ...staged };
        this.showName(this.isStaged("name") ? this.staged.name : this.saved.name());
        this.showFavicon();
    }

    showName(name) {
        if (name !== this.displayed.name) {
            this.titlePreview.show(name, this.displayed.name);
            this.displayed.name = name;
        }
    }

    showFavicon() {
        if (!this.isStaged("favicon")) {
            this.displayed.favicon.set(this.getSavedFavicon());
            this.faviconPreview.reset();
        } else if (this.staged.favicon) {
            const { img, mimetype } = this.staged.favicon;
            const url = img.getAttribute("src");
            const cropToSquare = !UNCROPPED_MIMETYPES.includes(mimetype);
            this.displayed.favicon.set({ url, cropToSquare });
            this.faviconPreview.show(url);
        } else {
            this.displayed.favicon.set(null);
            this.faviconPreview.showPlaceholder();
        }
    }

    // -------------------------------------------------------------------------
    // Saved favicon
    // -------------------------------------------------------------------------

    /**
     * Checks once whether the website has a favicon. The favicon URL can't tell,
     * because it returns a placeholder image when there is none.
     *
     * @returns {Promise<void>}
     */
    checkSavedFavicon() {
        return (this.faviconCheck ??= this.services.orm
            .searchCount("website", [
                ["id", "=", this.websiteId],
                ["favicon", "!=", false],
            ])
            .then(
                (count) => {
                    this.saved.hasFavicon = count > 0;
                    this.showFavicon();
                },
                (error) => {
                    this.faviconCheck = null;
                    throw error;
                }
            ));
    }

    getSavedFavicon() {
        // The server already cropped the saved favicon, so it is shown whole.
        return this.saved.hasFavicon
            ? {
                  url: `/web/image/website/${this.websiteId}/favicon?unique=${this.savedFaviconVersion}`,
                  cropToSquare: false,
              }
            : null;
    }

    // -------------------------------------------------------------------------
    // Save
    // -------------------------------------------------------------------------

    getPayload() {
        const payload = {};
        if (this.isStaged("name")) {
            payload.name = this.staged.name;
        }
        if (this.isStaged("favicon")) {
            payload.favicon = this.staged.favicon ? this.staged.favicon.attachmentId : false;
        }
        if (this.isStaged("logo") && !this.document.querySelector(HEADER_LOGO_SELECTOR)) {
            payload.logo = this.staged.logo.attachmentId;
        }
        return payload;
    }

    /**
     * Never throws, so the page save goes on.
     */
    async saveBranding() {
        const payload = this.getPayload();
        if (!Object.keys(payload).length) {
            this.clearStaged();
            return;
        }
        let result;
        try {
            result = await this.services.orm.call("website", "update_branding", [
                [this.websiteId],
                payload,
            ]);
        } catch (error) {
            this.notifyError(
                _t(
                    "The website branding could not be saved: %s",
                    error.data?.message || error.message
                )
            );
            this.clearStaged();
            return;
        }
        for (const [field, reason] of Object.entries(result.errors)) {
            this.notifyError(FIELD_ERROR_MESSAGES[field](reason));
        }
        await this.applySaveResult(payload, result);
    }

    async applySaveResult(payload, { name, has_favicon, errors }) {
        const isSaved = (field) => field in payload && !(field in errors);
        if (isSaved("name")) {
            this.saved.name.set(name);
            // For the website switcher and the reloaded editor.
            try {
                await this.services.website.fetchWebsites();
            } catch {
                // The name is already saved, so a failed refresh must not fail
                // the page save.
            }
        }
        if (isSaved("favicon")) {
            this.saved.hasFavicon = has_favicon;
            this.savedFaviconVersion = Date.now();
            this.faviconPreview.commit();
        }
        this.clearStaged();
    }

    clearStaged() {
        if (!Object.keys(this.staged).length) {
            return;
        }
        this.setStagedAndPreview({});
        this.trigger("on_dom_updated_handlers");
    }

    notifyError(message) {
        this.services.notification.add(message, { type: "danger", sticky: true });
    }
}

registry.category("website-plugins").add(ThemeBrandingPlugin.id, ThemeBrandingPlugin);

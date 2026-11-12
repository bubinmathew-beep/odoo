// -----------------------------------------------------------------------------
// Logos
// -----------------------------------------------------------------------------

export const HEADER_LOGO_SELECTOR = ".navbar-brand.logo span img";
const LOGO_SELECTOR = `${HEADER_LOGO_SELECTOR}, .o_footer_logo img`;
// The width is kept because footer templates set it.
const LOGO_STYLES_TO_REMOVE = [
    "transform",
    "transform-box",
    "transform-origin",
    "transform-style",
    "height",
];

export function applyLogo(root, pickedImg) {
    for (const img of root.querySelectorAll(LOGO_SELECTOR)) {
        for (const key of Object.keys(img.dataset)) {
            delete img.dataset[key];
        }
        for (const property of LOGO_STYLES_TO_REMOVE) {
            img.style.removeProperty(property);
        }
        img.setAttribute("src", pickedImg.getAttribute("src"));
        img.removeAttribute("srcset");
        img.classList.toggle(
            "o_modified_image_to_save",
            pickedImg.classList.contains("o_modified_image_to_save")
        );
        Object.assign(img.dataset, pickedImg.dataset);
    }
}

// -----------------------------------------------------------------------------
// Name
// -----------------------------------------------------------------------------

// Used to force Chrome to refresh the tab label.
const PREVIEW_TITLE_MARK = "\u200b";

// The browser collapses the spaces of `document.title`.
const collapseSpaces = (text) => text.replace(/[\t\n\f\r ]+/g, " ").trim();

/**
 * Previews the website name at the end of the page title, unless the page has
 * a custom SEO title.
 *
 * @param {import("@web/core/browser/title_plugin").TitlePlugin} titlePlugin
 * @param {Document} doc The page.
 */
export function createTitlePreview(titlePlugin, doc) {
    const defaultTitleMeta = doc.querySelector("meta[name='default_title']");
    const canPreview = !!defaultTitleMeta && collapseSpaces(defaultTitleMeta.content) === doc.title;
    // The editor puts the page title in the "action" part of the title.
    const getPageTitle = () => titlePlugin.getParts().action || "";
    let originalTitle;
    return {
        show(name, previousName) {
            const title = collapseSpaces(getPageTitle().replace(PREVIEW_TITLE_MARK, ""));
            originalTitle ??= title;
            previousName = collapseSpaces(previousName);
            if (canPreview && title.endsWith(previousName)) {
                const newTitle = title.slice(0, -previousName.length) + name;
                titlePlugin.setParts({
                    action: newTitle === originalTitle ? newTitle : newTitle + PREVIEW_TITLE_MARK,
                });
            }
        },
    };
}

// -----------------------------------------------------------------------------
// Favicon
// -----------------------------------------------------------------------------

// What the website serves as favicon when it has none.
const FAVICON_PLACEHOLDER_URL = "/web/static/img/placeholder.png";

/**
 * `reset` puts back the original favicon, or the one of the last `commit`.
 *
 * @param {Document} [doc] The document of the browser tab, the top window by
 *  default.
 */
export function createFaviconPreview(doc = window.top.document) {
    const getLinks = () => [...doc.head.querySelectorAll("link[rel*='icon']")];
    let resetHrefs = getLinks().map((link) => link.href);
    let isPreviewed = false;
    const show = (url) => {
        getLinks().forEach((link) => (link.href = url));
        isPreviewed = true;
    };
    return {
        show,
        showPlaceholder: () => show(FAVICON_PLACEHOLDER_URL),
        commit() {
            resetHrefs = getLinks().map((link) => link.href);
            isPreviewed = false;
        },
        reset() {
            if (isPreviewed) {
                getLinks().forEach((link, i) => (link.href = resetHrefs[i] ?? link.href));
                isPreviewed = false;
            }
        },
    };
}

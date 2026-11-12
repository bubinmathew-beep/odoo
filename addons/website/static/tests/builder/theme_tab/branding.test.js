import { defineWebsiteModels, setupWebsiteBuilder } from "../website_helpers";
import { after, describe, test, expect } from "@odoo/hoot";
import { animationFrame, queryOne, waitForNone } from "@odoo/hoot-dom";
import { contains, getService, makeServerError, onRpc } from "@web/../tests/web_test_helpers";
import { exampleContent, modifyText, unfoldAllOptionsGroups } from "@html_builder/../tests/helpers";

defineWebsiteModels();

const LOGO_SRC = "/web/image/website/1/logo";
const HEADER_WITH_IMAGE = `
    <header id="top" data-oe-model="ir.ui.view" data-oe-id="2" data-oe-field="arch">
        <nav><a href="/" class="navbar-brand logo">
            <span data-oe-model="website" data-oe-id="1" data-oe-field="logo" data-oe-type="image"
                data-oe-expression="website.logo"><img src="${LOGO_SRC}" alt="My Website"/></span>
        </a></nav>
    </header>`;
const HEADER_WITH_TEXT = `
    <header id="top" data-oe-model="ir.ui.view" data-oe-id="2" data-oe-field="arch">
        <nav><a href="/" class="navbar-brand">My Website</a></nav>
    </header>`;
const FOOTER_WITH_LOGO = `
    <footer id="bottom" data-oe-model="ir.ui.view" data-oe-id="3" data-oe-field="arch">
        <div class="o_footer_logo"><img src="${LOGO_SRC}" alt="My Website"/></div>
    </footer>`;

// The media dialog optimizes a picked image: its src becomes a data URL.
const PICKED_SRC = /^data:image\//;
// Ends every previewed title that differs from the original one.
const PREVIEW_TITLE_MARK = "\u200b";
const NAME_INPUT = "[data-action-id='setWebsiteName'] input";
const UNDO = ".o_hb_snippets_menu button[data-icon='undo']";
const REDO = ".o_hb_snippets_menu button[data-icon='redo']";
const SAVE = ".o_hb_snippets_top_actions button[data-action='save']";
const DISCARD = ".o_hb_snippets_top_actions button[data-action='cancel']";
const HEADER_IMG = ":iframe header .navbar-brand.logo img";
const FOOTER_IMG = ":iframe footer .o_footer_logo img";
const REPLACE_FAVICON = "[data-action-id='replaceFavicon']";
const REMOVE_FAVICON = "[data-action-id='removeFavicon']";
const FAVICON_THUMBNAIL = "[data-label='Favicon'] img";
const REPLACE_LOGO = "[data-label='Logo'] [data-action-id='replaceLogo']";

function websiteRecords(name) {
    return {
        length: 1,
        records: [{ id: 1, name, default_lang_id: { code: "en_US" }, company_id: 1 }],
    };
}

/**
 * Opens the builder on a website named "My Website" with a favicon, a page
 * titled "Home | My Website" (its default title), and the Theme tab unfolded.
 */
async function setupBranding({
    header = HEADER_WITH_IMAGE,
    websiteName = "My Website",
    pageTitle = `Home | ${websiteName}`,
    // The title the layout renders in the default_title meta for designers.
    // Null renders the meta without content.
    defaultTitle = pageTitle,
    footer = "",
    // What reading the websites again returns. By default, the initial name.
    fetchWebsites = null,
    faviconCount = () => 1,
    updateBranding = ({ args }) => {
        expect.step(`update_branding ${JSON.stringify(args[1])}`);
        return {
            name: args[1].name || websiteName,
            has_favicon: args[1].favicon !== false,
            errors: {},
        };
    },
} = {}) {
    // The favicon preview changes the test runner tab (window.top): restore it.
    const iconLinks = [...window.top.document.head.querySelectorAll("link[rel*='icon']")];
    const initialHrefs = iconLinks.map((link) => link.href);
    after(() => iconLinks.forEach((link, i) => (link.href = initialHrefs[i])));

    let websiteReads = 0;
    onRpc("website", "web_search_read", () => {
        // The first read is the website service loading the websites.
        if (websiteReads++ && fetchWebsites) {
            return fetchWebsites();
        }
        return websiteRecords(websiteName);
    });
    onRpc("website", "search_count", faviconCount);
    onRpc("website", "update_branding", updateBranding);
    // When the selection lands in the text header link, its popover loads a
    // preview of the home page.
    onRpc("/", () => ({}));
    onRpc("/html_editor/link_preview_internal", () => ({}));
    // The page save turns the picked image into an attachment. The test
    // harness gives it the original id 1.
    onRpc("/html_editor/modify_image/1", () => {
        expect.step("modify_image");
        return { original: "/web/image/99-abc/new_logo.webp" };
    });
    // Not stepped, because the page and branding saves run concurrently.
    const viewSaves = [];
    onRpc("ir.ui.view", "save", ({ args }) => {
        viewSaves.push(args[1]);
        return true;
    });
    let attachmentDomain;
    onRpc("ir.attachment", "search_read", ({ kwargs }) => {
        attachmentDomain = kwargs.domain;
        return [
            {
                id: 42,
                name: "new_logo",
                mimetype: "image/png",
                image_src: "/web/static/img/logo2.png",
                type: "binary",
                access_token: false,
                public: true,
            },
            {
                id: 44,
                name: "vector_logo",
                mimetype: "image/svg+xml",
                image_src: "/web/static/img/logo.svg",
                type: "binary",
                access_token: false,
                public: true,
            },
            {
                // Added by URL while the browser could not download it.
                id: 43,
                name: "remote_logo",
                mimetype: "image/png",
                image_src: "/web/static/img/logo.png",
                url: "/web/static/img/logo.png",
                type: "url",
                access_token: false,
                public: true,
            },
        ];
    });
    const builder = await setupWebsiteBuilder(exampleContent, {
        headerContent: header,
        footerContent: footer,
        onIframeLoaded: ({ contentDocument: doc }) => {
            doc.title = pageTitle;
            // The browser collapses the spaces of the title.
            pageTitle = doc.title;
            const meta = doc.createElement("meta");
            meta.name = "default_title";
            if (defaultTitle !== null) {
                meta.content = defaultTitle;
            }
            doc.head.append(meta);
        },
    });
    // What the editor does with the page title when the page loads.
    getService("title").setParts({ action: pageTitle });
    await contains(".o_hb_snippets_tabs button[data-name=theme]").click();
    await unfoldAllOptionsGroups();
    return {
        ...builder,
        getSavedArchs: () => viewSaves,
        getAttachmentDomain: () => attachmentDomain,
    };
}

async function rename(name) {
    await contains(NAME_INPUT).edit(name);
    await animationFrame();
}

async function pickImage(name = "new_logo") {
    await contains(`.o_select_media_dialog .o_button_area[aria-label='${name}']`).click();
    await waitForNone(".o_select_media_dialog");
    await animationFrame();
}

async function pickFavicon(name) {
    await contains(REPLACE_FAVICON).click();
    await pickImage(name);
}

async function pickLogo(name) {
    await contains(REPLACE_LOGO).click();
    await pickImage(name);
}

async function clickAndAnimate(selector) {
    await contains(selector).click();
    await animationFrame();
}

async function saveAndClose() {
    await contains(SAVE).click();
    await animationFrame();
}

describe("Website name", () => {
    test("renaming previews the new name in the tab title, not in the header text", async () => {
        // A header showing the name as text.
        await setupBranding({ header: HEADER_WITH_TEXT });

        // Rename the website: the title changes, not the header text, which
        // is free text of the page.
        await rename("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);
        expect(":iframe header .navbar-brand").toHaveText("My Website");
    });

    test("a page title that is only the name is previewed", async () => {
        // The default title of the page is the bare website name.
        await setupBranding({ pageTitle: "My Website" });

        // Rename the website.
        await rename("New Name");
        expect(document.title).toBe(`New Name${PREVIEW_TITLE_MARK}`);
    });

    test("a page with a custom SEO title is not previewed, the name is still saved", async () => {
        // The page has its own SEO title, which ends with the name by chance:
        // a rename won't change it.
        await setupBranding({
            pageTitle: "Coffee by My Website",
            defaultTitle: "Home | My Website",
        });

        // Rename the website: the title stays.
        await rename("New Name");
        expect(document.title).toBe("Coffee by My Website");

        // Undo/redo still restore the input.
        await clickAndAnimate(UNDO);
        expect(NAME_INPUT).toHaveValue("My Website");
        await clickAndAnimate(REDO);
        expect(NAME_INPUT).toHaveValue("New Name");

        // Save: the name is sent anyway.
        await saveAndClose();
        expect.verifySteps([`update_branding {"name":"New Name"}`]);
        // The title gets no invisible mark either, so it won't change on reload.
        expect(document.title).toBe("Coffee by My Website");
    });

    test("a page whose default title is unknown is not previewed", async () => {
        // The controller gave the page its title: the layout renders the meta
        // without content.
        await setupBranding({ defaultTitle: null });

        // Rename the website: the title stays.
        await rename("New Name");
        expect(document.title).toBe("Home | My Website");
    });

    test("a name with several spaces in a row is previewed", async () => {
        // The browser collapses the spaces of the page title, not the ones of
        // the meta nor of the saved name.
        await setupBranding({ websiteName: "My  Website" });
        expect(document.title).toBe("Home | My Website");

        // Rename the website.
        await rename("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);
    });

    test("typing a name previews nothing until the input is committed", async () => {
        // Type a new name without leaving the input: the option doesn't
        // preview per key, so a rename is one history step.
        await setupBranding();
        await contains(NAME_INPUT).edit("New Name", { confirm: false });
        await animationFrame();
        expect(document.title).toBe("Home | My Website");
        expect(UNDO).not.toBeEnabled();
    });

    test("a rename is an unsaved change: Discard asks for confirmation", async () => {
        // Rename the website, then click Discard.
        await setupBranding();
        await rename("New Name");
        await contains(DISCARD).click();
        expect(".modal-content").toHaveCount(1); // The "Discard all changes?" dialog.
    });

    test("undo/redo of a rename restore the name input and the tab title", async () => {
        // Rename the website.
        await setupBranding();
        await rename("New Name");

        // Undo: the original name comes back in the input and the title.
        await clickAndAnimate(UNDO);
        expect(NAME_INPUT).toHaveValue("My Website");
        expect(document.title).toBe("Home | My Website");

        // Redo: the new name again.
        await clickAndAnimate(REDO);
        expect(NAME_INPUT).toHaveValue("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);
    });

    test("undoing a rename saves nothing", async () => {
        // Rename the website, undo, then save.
        await setupBranding();
        await rename("New Name");
        await clickAndAnimate(UNDO);
        await saveAndClose();
        expect.verifySteps([]); // No update_branding call.
    });

    test("saving sends the last name only", async () => {
        // Rename the website twice.
        await setupBranding();
        await rename("Other Name");
        await rename("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);

        // Save: only the last name is sent.
        await saveAndClose();
        expect.verifySteps([`update_branding {"name":"New Name"}`]);
    });

    test("a rename doesn't touch the header logo, so the page save writes nothing", async () => {
        // A header logo image, whose title and aria-label show the name.
        const { getSavedArchs } = await setupBranding();

        // Rename and save.
        await rename("New Name");
        await saveAndClose();

        // Only the RPC saves the name: the logo field is not rewritten.
        expect.verifySteps([`update_branding {"name":"New Name"}`]);
        expect(getSavedArchs()).toEqual([]);
    });

    test("clearing the name falls back to the saved name: nothing is sent", async () => {
        // Empty the name input.
        await setupBranding();
        await rename("");
        expect(document.title).toBe("Home | My Website");

        // Save.
        await saveAndClose();
        expect.verifySteps([]);
    });

    test("spaces around the name are not a change: nothing is sent", async () => {
        // Add a trailing space to the saved name.
        await setupBranding();
        await rename("My Website ");
        expect(document.title).toBe("Home | My Website");
        expect(UNDO).not.toBeEnabled(); // No history step.

        // Save.
        await saveAndClose();
        expect.verifySteps([]);
    });
});

describe("Favicon", () => {
    test("replacing the favicon is an unsaved change and can be undone", async () => {
        // The test harness shows the same placeholder in every <img>: check the
        // tab icon (window.top) instead.
        await setupBranding();
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");
        const initialHref = tabIcon.href;

        // Pick a new favicon: the tab icon previews it.
        await pickFavicon();
        expect(tabIcon.href).toMatch(PICKED_SRC);

        // Undo: the original tab icon comes back.
        await clickAndAnimate(UNDO);
        expect(tabIcon.href).toBe(initialHref);

        // Redo, then Discard: it asks for confirmation.
        await clickAndAnimate(REDO);
        await contains(DISCARD).click();
        expect(".modal-content").toHaveCount(1);
    });

    test("the thumbnail shows the part of a picked image the favicon keeps", async () => {
        // The saved favicon is shown whole.
        await setupBranding();
        expect(FAVICON_THUMBNAIL).toHaveClass("object-fit-contain");

        // Pick a PNG: the server crops it to a centered square.
        await pickFavicon("new_logo");
        expect(FAVICON_THUMBNAIL).toHaveClass("object-fit-cover");

        // Pick an SVG: the server stores it as it is, uncropped.
        await pickFavicon("vector_logo");
        expect(FAVICON_THUMBNAIL).toHaveClass("object-fit-contain");
    });

    test("the Theme tab waits for the favicon check", async () => {
        // The check for an existing favicon (search_count) is still pending:
        // nothing can be changed yet.
        const faviconCheck = Promise.withResolvers();
        await setupBranding({ faviconCount: () => faviconCheck.promise });
        expect(NAME_INPUT).toHaveCount(0);

        // The check answers: the row shows the saved favicon with its
        // remove button.
        faviconCheck.resolve(1);
        await animationFrame();
        expect(NAME_INPUT).toHaveCount(1);
        expect(REMOVE_FAVICON).toHaveCount(1);
    });

    test("when the favicon check fails, the error is shown, the Theme tab doesn't open, and the check runs again on the next opening", async () => {
        // The first check for an existing favicon (search_count) fails: the
        // error goes up, as for the other options that load data before
        // showing. The next one answers.
        expect.errors(1);
        let checks = 0;
        await setupBranding({
            faviconCount: () => {
                if (!checks++) {
                    throw makeServerError({ message: "Server unreachable" });
                }
                return 1;
            },
        });
        expect.verifyErrors(["Server unreachable"]);

        // The Theme tab doesn't open (its render is dropped), so no row can
        // show a wrong "None". The editor itself stays usable.
        expect(REPLACE_FAVICON).toHaveCount(0);
        expect("button[data-name=theme]").not.toHaveClass("active");
        expect(SAVE).toHaveCount(1);

        // Clicking Theme again does nothing: the builder already counts it as
        // the active tab.
        await contains("button[data-name=theme]").click();
        expect(checks).toBe(1);

        // Go to another tab, then open the Theme tab: the favicon is checked
        // again.
        await contains("button[data-name=blocks]").click();
        await contains("button[data-name=theme]").click();
        await unfoldAllOptionsGroups();
        expect(checks).toBe(2);
        expect(REMOVE_FAVICON).toHaveCount(1);
    });

    test("Discard puts back every tab icon link", async () => {
        // The tab has an extra icon link (apple-touch-icon), which the
        // editor itself doesn't reset when it closes.
        const appleIcon = window.top.document.createElement("link");
        appleIcon.rel = "apple-touch-icon";
        appleIcon.href = "/apple-touch.png";
        window.top.document.head.appendChild(appleIcon);
        after(() => appleIcon.remove());
        await setupBranding();
        const initialHref = appleIcon.href;

        // Remove the favicon: every icon link previews the placeholder.
        await clickAndAnimate(REMOVE_FAVICON);
        expect(appleIcon.href).toMatch(/placeholder\.png$/);

        // Discard and confirm.
        await contains(DISCARD).click();
        await contains(".modal-footer .btn-primary").click();
        await animationFrame();
        expect(appleIcon.href).toBe(initialHref);
    });

    test("removing the favicon previews the placeholder in the tab, the row shows None", async () => {
        // The website has a favicon: the row shows it with a remove button.
        await setupBranding();
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");
        expect(REMOVE_FAVICON).toHaveCount(1);

        // Remove it.
        await clickAndAnimate(REMOVE_FAVICON);
        expect(tabIcon.href).toMatch(/\/web\/static\/img\/placeholder\.png$/); // What the site will serve.
        expect(FAVICON_THUMBNAIL).toHaveCount(0);
        expect(REMOVE_FAVICON).toHaveCount(0);
        expect(REPLACE_FAVICON).toHaveText("None");
    });

    test("an image stored as a link (no data) is refused when picked", async () => {
        // Pick the image added by URL (attachment 43, type "url").
        await setupBranding();
        await pickFavicon("remote_logo");
        expect(".o_notification").toHaveText(
            "This image is only a link to another website. Please upload the file instead."
        );

        // Save: nothing was staged.
        await saveAndClose();
        expect.verifySteps([]);
    });
});

describe("Logo", () => {
    test("with a header logo image, undo/redo apply to every logo and the page save writes the logo without an RPC", async () => {
        // Replace the logo everywhere.
        const { getSavedArchs } = await setupBranding({ footer: FOOTER_WITH_LOGO });
        await pickLogo();
        expect(HEADER_IMG).toHaveAttribute("src", PICKED_SRC);
        expect(FOOTER_IMG).toHaveAttribute("src", PICKED_SRC);

        // Undo: both images get their original src back.
        await clickAndAnimate(UNDO);
        expect(HEADER_IMG).toHaveAttribute("src", LOGO_SRC);
        expect(FOOTER_IMG).toHaveAttribute("src", LOGO_SRC);

        // Redo, then save.
        await clickAndAnimate(REDO);
        expect(HEADER_IMG).toHaveAttribute("src", PICKED_SRC);
        await saveAndClose();
        // The picked image became an attachment first, so no data URL is saved.
        expect.verifySteps(["modify_image", "modify_image"]); // Header and footer.
        expect(getSavedArchs().length).toBe(2);
        expect(getSavedArchs().join("")).not.toInclude("data:");
    });

    test("with a text header and a footer logo, the page saves the footer image and the RPC the logo field", async () => {
        // The header shows the name as text.
        await setupBranding({ header: HEADER_WITH_TEXT, footer: FOOTER_WITH_LOGO });

        // Replace the logo everywhere, then save.
        await pickLogo();
        await saveAndClose();
        expect.verifySteps(["modify_image", `update_branding {"logo":42}`]);
    });

    test("with no logo image in the page, only the RPC saves the logo", async () => {
        // A text header and no footer logo: nothing in the page shows the logo.
        await setupBranding({ header: HEADER_WITH_TEXT });

        // Replace the logo, then save: nothing to optimize, the RPC writes
        // the field.
        await pickLogo();
        await saveAndClose();
        expect.verifySteps([`update_branding {"logo":42}`]);
    });

    test("with a text header, replacing the logo then undoing it saves nothing", async () => {
        // The header shows the name as text. The RPC is the only way the logo
        // is saved, so undo must unstage it too.
        await setupBranding({ header: HEADER_WITH_TEXT, footer: FOOTER_WITH_LOGO });

        // Replace the logo everywhere.
        await pickLogo();
        expect(FOOTER_IMG).toHaveAttribute("src", PICKED_SRC);

        // Undo, then save.
        await clickAndAnimate(UNDO);
        expect(FOOTER_IMG).toHaveAttribute("src", LOGO_SRC);
        await saveAndClose();
        expect.verifySteps([]);
    });
});

describe("Media dialog", () => {
    test("the media dialog offers images only, without the media library and its illustrations", async () => {
        // The selection is in the page content. Without useMediaLibrary: false,
        // the dialog would offer the media library from there.
        const { getEditor, getAttachmentDomain } = await setupBranding();
        const textNode = queryOne(":iframe h1.title").firstChild;
        getEditor().shared.selection.setSelection({ anchorNode: textNode, anchorOffset: 0 });

        // Open the media dialog from the Theme tab.
        await contains(REPLACE_FAVICON).click();
        await animationFrame();
        expect(".o_select_media_dialog").toHaveCount(1);
        // Without the media library, the dialog hides the illustrations.
        expect(JSON.stringify(getAttachmentDomain())).toInclude("/html_editor/shape/%");
        // Images only: no icon, video or document tab.
        expect(".o_select_media_dialog .nav-link").toHaveCount(1);
        expect(".o_select_media_dialog .nav-link").toHaveText("Images");
        // It lists the website's own images (e.g. the previous logos).
        expect(JSON.stringify(getAttachmentDomain())).toInclude(
            '["res_model","=","website"],["res_id","=",1]'
        );
    });
});

describe("Save", () => {
    test("saving a custom snippet does not save the branding", async () => {
        // "Save as custom snippet" runs the on_will_save_handlers, not the
        // on_ready_to_save_document_handlers. It must not send update_branding
        // nor change the title preview.
        onRpc("ir.ui.view", "save_snippet", () => {
            expect.step("save_snippet");
            return "Custom Cover";
        });
        await setupBranding();

        // Put a snippet in the page, then rename the website.
        queryOne(":iframe #wrap").insertAdjacentHTML(
            "beforeend",
            `<section data-snippet="s_cover" class="s_cover"><p>Cover</p></section>`
        );
        await rename("New Name");

        // Save the snippet as a custom snippet.
        await contains(":iframe section.s_cover").click();
        await contains("button.oe_snippet_save").click();
        await expect.waitForSteps(["save_snippet"]); // No update_branding.
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`); // The preview is kept.
    });

    test("a refused field is dropped with a notification, the rest is saved", async () => {
        // The server refuses the name but saves the favicon.
        const { getEditor, getEditableContent, getSavedArchs } = await setupBranding({
            updateBranding: ({ args }) => {
                expect.step(`update_branding ${JSON.stringify(args[1])}`);
                return {
                    name: "My Website",
                    has_favicon: false,
                    errors: { name: "The website name cannot be empty." },
                };
            },
        });

        // Edit the page text, rename the website and remove the favicon.
        await modifyText(getEditor(), getEditableContent());
        await rename("New Name");
        await clickAndAnimate(REMOVE_FAVICON);

        // Save without closing the editor: the page and the favicon removal
        // are saved, only the refused name is reported.
        await getEditor().shared.savePlugin.save();
        await animationFrame();
        expect.verifySteps([`update_branding {"name":"New Name","favicon":false}`]);
        expect(getSavedArchs().length).toBe(1);
        expect(".o_notification").toHaveCount(1);
        expect(".o_notification").toHaveText(
            "The website name could not be saved: The website name cannot be empty."
        );

        // The refused name is back to the saved one, the removal is kept.
        expect(NAME_INPUT).toHaveValue("My Website");
        expect(REPLACE_FAVICON).toHaveText("None");
    });

    test("a failed branding call does not prevent saving the page", async () => {
        // The whole call fails (e.g. access error): the page save must still
        // complete, with no error dialog.
        const { getEditor, getEditableContent, getSavedArchs } = await setupBranding({
            updateBranding: () => {
                throw makeServerError({ message: "Access denied", type: "AccessError" });
            },
        });

        // Edit the page text and rename the website.
        await modifyText(getEditor(), getEditableContent());
        await rename("New Name");

        // Save: the page is saved, a notification explains, no error dialog.
        await saveAndClose();
        expect(getSavedArchs().length).toBe(1);
        expect(".o_notification").toHaveText(
            "The website branding could not be saved: Access denied"
        );
        expect(".o_error_dialog").toHaveCount(0);
    });

    test("a saved favicon removal shows None and keeps the placeholder once the editor is closed", async () => {
        // Remove the favicon.
        const { getEditor } = await setupBranding();
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");
        await clickAndAnimate(REMOVE_FAVICON);

        // Save without closing the editor. The removal is sent and the row
        // shows "None", the new saved state.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([`update_branding {"favicon":false}`]);
        expect(REPLACE_FAVICON).toHaveText("None");

        // Save and close the editor: the tab keeps the placeholder, it is what
        // the site serves now.
        await saveAndClose();
        expect(tabIcon.href).toMatch(/\/web\/static\/img\/placeholder\.png$/);
    });

    test("after a save, nothing is staged and the saved values are the new ones", async () => {
        // A text header: the logo is saved by the RPC.
        const { getEditor } = await setupBranding({
            header: HEADER_WITH_TEXT,
            footer: FOOTER_WITH_LOGO,
        });
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");

        // Change the three fields.
        await rename("New Name");
        await pickFavicon();
        await pickLogo();
        const pickedFaviconHref = tabIcon.href;

        // Save without closing the editor, as before a reload of the editor.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([
            "modify_image",
            `update_branding {"name":"New Name","favicon":42,"logo":42}`,
        ]);

        // Nothing is staged anymore: saving again sends nothing.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([]);

        // The editor stays open (e.g. "Add a language" cancelled): the new name
        // is still shown, and it is now the saved one, so clearing the input
        // falls back to it and nothing is staged.
        expect(NAME_INPUT).toHaveValue("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);
        await rename("");
        expect(NAME_INPUT).toHaveValue("New Name");
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([]);

        // Renaming again still previews in the title.
        await rename("Third Name");
        expect(document.title).toBe(`Home | Third Name${PREVIEW_TITLE_MARK}`);

        // The saved favicon is shown, with its remove button.
        expect(REMOVE_FAVICON).toHaveCount(1);

        // Closing the editor keeps the saved favicon in the tab.
        getEditor().destroy();
        expect(tabIcon.href).toBe(pickedFaviconHref);
    });

    test("after a save, the website service reads the websites again", async () => {
        // Some saves reload the editor, for example the edit menu, fonts or
        // header templates. The branding plugin of the reloaded editor reads
        // the name from the website service, so it must have the saved name.
        const { getEditor } = await setupBranding({
            fetchWebsites: () => {
                expect.step("fetch websites");
                return websiteRecords("New Name");
            },
        });

        // Rename the website and save without closing the editor.
        await rename("New Name");
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([`update_branding {"name":"New Name"}`, "fetch websites"]);

        // The next editor reads the saved name.
        expect(getService("website").currentWebsite.name).toBe("New Name");
    });

    test("after a save, failing to read the websites again doesn't fail the page save", async () => {
        // The name is saved, but reading the websites again fails.
        const { getEditor, getEditableContent, getSavedArchs } = await setupBranding({
            fetchWebsites: () => {
                throw makeServerError({ message: "Server unreachable" });
            },
        });

        // Edit the page text, rename the website and save.
        await modifyText(getEditor(), getEditableContent());
        await rename("New Name");
        await saveAndClose();

        // The page is saved, no error dialog.
        expect.verifySteps([`update_branding {"name":"New Name"}`]);
        expect(getSavedArchs().length).toBe(1);
        expect(".o_error_dialog").toHaveCount(0);
    });

    test("after a save that refuses the values, the saved ones are shown again", async () => {
        // The server refuses the name and the favicon. The editor stays open
        // (e.g. "Add a language" cancelled): the preview must not keep showing
        // values that were not saved.
        const { getEditor } = await setupBranding({
            updateBranding: ({ args }) => {
                expect.step(`update_branding ${JSON.stringify(args[1])}`);
                return {
                    name: "My Website",
                    has_favicon: true,
                    errors: { name: "Refused name.", favicon: "Refused favicon." },
                };
            },
        });
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");
        const initialHref = tabIcon.href;

        // Rename the website and pick a new favicon.
        await rename("New Name");
        await pickFavicon();

        // Save without closing the editor.
        await getEditor().shared.savePlugin.save();
        await animationFrame();
        expect.verifySteps([`update_branding {"name":"New Name","favicon":42}`]);

        // The saved name and favicon are shown again: title, input, tab icon.
        expect(document.title).toBe("Home | My Website");
        expect(NAME_INPUT).toHaveValue("My Website");
        expect(tabIcon.href).toBe(initialHref);
        expect(REMOVE_FAVICON).toHaveCount(1);

        // Nothing is staged anymore: saving again sends nothing.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([]);
    });

    test("after a failed branding call, the saved values are shown again", async () => {
        // The whole call fails. The history is reset by the save, so the
        // values can't stay staged: they would be sent again by the next save
        // without Discard warning about them.
        const { getEditor } = await setupBranding({
            updateBranding: () => {
                expect.step("update_branding");
                throw makeServerError({ message: "Access denied", type: "AccessError" });
            },
        });
        const tabIcon = window.top.document.head.querySelector("link[rel*='icon']");
        const initialHref = tabIcon.href;

        // Rename the website and remove the favicon.
        await rename("New Name");
        await clickAndAnimate(REMOVE_FAVICON);

        // Save without closing the editor.
        await getEditor().shared.savePlugin.save();
        await animationFrame();
        expect.verifySteps(["update_branding"]);

        // The saved name and favicon are shown again.
        expect(document.title).toBe("Home | My Website");
        expect(NAME_INPUT).toHaveValue("My Website");
        expect(tabIcon.href).toBe(initialHref);
        expect(REMOVE_FAVICON).toHaveCount(1);

        // Nothing is staged anymore: saving again sends nothing.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([]);
    });

    test("a previewed title ends with an invisible mark, except when it is back to the original title", async () => {
        // Chrome may keep a stale tab label when the title is set to the value
        // it already has. After the save, the page reload sets "Home | New
        // Name" again, so the previewed title must differ from it by an
        // invisible mark.
        const { getEditor } = await setupBranding();
        await rename("New Name");
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);

        // Save without closing the editor: the title stays as it is.
        await getEditor().shared.savePlugin.save();
        expect.verifySteps([`update_branding {"name":"New Name"}`]);
        expect(document.title).toBe(`Home | New Name${PREVIEW_TITLE_MARK}`);

        // Rename back to the original name: the original title, no mark.
        await rename("My Website");
        expect(document.title).toBe("Home | My Website");
    });
});

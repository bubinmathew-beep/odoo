import {
    applyLogo,
    createFaviconPreview,
    createTitlePreview,
} from "@website/builder/plugins/theme/theme_branding_utils";
import { beforeEach, describe, expect, test } from "@odoo/hoot";

// Ends every previewed title that differs from the original one.
const PREVIEW_TITLE_MARK = "\u200b";

describe("Theme branding utils", () => {
    describe("applyLogo", () => {
        let container;

        beforeEach(() => {
            container = document.createElement("div");
            container.innerHTML = `
                <header>
                    <div class="navbar-brand logo">
                        <span><img src="old_header.png" /></span>
                    </div>
                </header>
                <footer>
                    <div class="o_footer_logo">
                        <img src="old_footer.png" />
                    </div>
                </footer>
                <div>
                    <img class="untouched" src="ignore.png" />
                </div>
            `;
        });

        test("copies the picked image to the header and footer logos, not to other images", () => {
            // An image as the media dialog returns it: processed, to be saved
            // as an attachment with the page.
            const picked = document.createElement("img");
            picked.setAttribute("src", "data:image/webp;base64,AAAA");
            picked.className = "o_modified_image_to_save";
            picked.dataset.originalId = "42";

            // Apply it: the header and footer logos show it, other images don't.
            applyLogo(container, picked);
            for (const img of container.querySelectorAll("header img, footer img")) {
                expect(img.getAttribute("src")).toBe("data:image/webp;base64,AAAA");
                expect(img).toHaveClass("o_modified_image_to_save");
                expect(img.dataset.originalId).toBe("42");
            }
            expect(container.querySelector(".untouched").getAttribute("src")).toBe("ignore.png");
        });

        test("data attributes left by a previous edit of the logo are removed", () => {
            // The footer logo was edited before (shape, original image).
            const footerImg = container.querySelector("footer img");
            footerImg.dataset.shape = "html_builder/geometric/geo_square";
            footerImg.dataset.originalId = "7";

            // Apply an image without processing attributes, such as an SVG.
            const picked = document.createElement("img");
            picked.setAttribute("src", "/web/image/43-abc/logo.svg");
            picked.dataset.attachmentId = "43";
            applyLogo(container, picked);
            expect(footerImg.dataset.shape).toBe(undefined);
            expect(footerImg.dataset.originalId).toBe(undefined);
            expect(footerImg.dataset.attachmentId).toBe("43");
        });

        test("the rotation and height given to the previous logo are removed, not its width", () => {
            // The footer logo was resized and rotated in the page.
            const footerImg = container.querySelector("footer img");
            footerImg.setAttribute(
                "style",
                "transform: rotate(10deg); transform-origin: 0 0; width: 40px; height: 20px; margin: 4px;"
            );

            // Apply a new image. It must not show rotated or stretched, and it
            // keeps its width because footer templates set one.
            const picked = document.createElement("img");
            picked.setAttribute("src", "/web/image/43-abc/logo.png");
            applyLogo(container, picked);
            expect(footerImg.getAttribute("style")).toBe("width: 40px; margin: 4px;");
        });
    });

    describe("createTitlePreview", () => {
        function mockTitlePlugin(parts) {
            let currentParts = { ...parts };
            return {
                getParts: () => ({ ...currentParts }),
                setParts: (parts) => {
                    currentParts = { ...currentParts, ...parts };
                },
            };
        }

        /**
         * A stub page with a title and a default title meta. The test runner
         * mocks `document.title`, so a real document can't be used.
         */
        function mockPage(title, defaultTitle = title) {
            return {
                title,
                querySelector: (selector) =>
                    selector === "meta[name='default_title']" ? { content: defaultTitle } : null,
            };
        }

        test("replaces the website name at the end of the page title only", () => {
            // Title parts: the page title (action part), plus another part
            // that also ends with the name.
            const titlePlugin = mockTitlePlugin({ action: "Home | Shop", other: "Coffee Shop" });
            const preview = createTitlePreview(titlePlugin, mockPage("Home | Shop"));

            // Rename "Shop" to "Store": only the page title changes.
            preview.show("Store", "Shop");
            expect(titlePlugin.getParts()).toEqual({
                action: `Home | Store${PREVIEW_TITLE_MARK}`,
                other: "Coffee Shop",
            });
        });

        test("replaces a page title that is only the website name", () => {
            // The homepage title can be the bare name (no page name before it).
            const titlePlugin = mockTitlePlugin({ action: "Shop" });
            const preview = createTitlePreview(titlePlugin, mockPage("Shop"));

            // Rename "Shop" to "Store".
            preview.show("Store", "Shop");
            expect(titlePlugin.getParts().action).toBe(`Store${PREVIEW_TITLE_MARK}`);
        });

        test("renames a previewed title again, back to the original without mark", () => {
            const titlePlugin = mockTitlePlugin({ action: "Home | Shop" });
            const preview = createTitlePreview(titlePlugin, mockPage("Home | Shop"));

            // Rename "Shop" to "Store", then "Store" to "Market": the name is
            // found before the mark.
            preview.show("Store", "Shop");
            preview.show("Market", "Store");
            expect(titlePlugin.getParts().action).toBe(`Home | Market${PREVIEW_TITLE_MARK}`);

            // Rename back to "Shop": the original title, so no mark.
            preview.show("Shop", "Market");
            expect(titlePlugin.getParts().action).toBe("Home | Shop");
        });

        test("leaves a page with a custom SEO title alone", () => {
            // The page title differs from its default title.
            const titlePlugin = mockTitlePlugin({ action: "Coffee by Shop" });
            const preview = createTitlePreview(
                titlePlugin,
                mockPage("Coffee by Shop", "Home | Shop")
            );

            // Rename: nothing changes, no mark either.
            preview.show("Store", "Shop");
            expect(titlePlugin.getParts().action).toBe("Coffee by Shop");
        });
    });

    describe("createFaviconPreview", () => {
        test("previews on every icon link, and reset puts each one back", () => {
            // A detached document with three kinds of icon links, so the test
            // runner tab favicon is not touched.
            const mockDoc = document.implementation.createHTMLDocument("Mocked Doc");
            for (const [rel, href] of [
                ["icon", "/icon.ico"],
                ["shortcut icon", "/shortcut.ico"],
                ["apple-touch-icon", "/apple.png"],
            ]) {
                const link = mockDoc.createElement("link");
                link.rel = rel;
                link.href = href;
                mockDoc.head.appendChild(link);
            }
            const links = [...mockDoc.head.querySelectorAll("link")];
            const initialHrefs = links.map((link) => link.href);
            const preview = createFaviconPreview(mockDoc);

            // Preview a new favicon: all links use it.
            preview.show("/new.ico");
            expect(links.map((link) => link.getAttribute("href"))).toEqual([
                "/new.ico",
                "/new.ico",
                "/new.ico",
            ]);

            // Preview no favicon: the links show what the website serves
            // without one.
            preview.showPlaceholder();
            expect(links[0].getAttribute("href")).toBe("/web/static/img/placeholder.png");

            // Reset: each link gets its own original href back.
            preview.reset();
            expect(links.map((link) => link.href)).toEqual(initialHrefs);
        });
    });
});

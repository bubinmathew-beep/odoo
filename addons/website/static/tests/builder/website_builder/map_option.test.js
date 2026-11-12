import { expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { generateGMapIframe } from "@website/snippets/s_map/map";
import { contains } from "@web/../tests/web_test_helpers";
import { getIframeInput } from "@html_editor/../tests/_helpers/iframe_input";
import {
    defineWebsiteModels,
    setupWebsiteBuilderWithSnippet,
} from "@website/../tests/builder/website_helpers";

defineWebsiteModels();

test("test description option", async () => {
    await setupWebsiteBuilderWithSnippet("s_map", { loadIframeBuilderTemplates: true });
    // In test mode the map has no iframe and no SCSS, so it has no size.
    await contains(":iframe .s_map", { visible: false }).click();

    // toggle description
    await contains("[data-action-id='mapDescription'] input").click();
    expect(":iframe .s_map .description").toBeVisible();

    // Description Text is editable
    expect(":iframe .s_map .description").toHaveAttribute("contenteditable", "true");

    // Check Gradient tab background color
    await contains("div[data-label='Background Color'] .o_we_color_preview").click();
    await contains(".o_popover .o_font_color_selector .btn-tab:contains('Gradient')").click();
    await contains(
        ".o_colorpicker_sections .o_color_button[data-color='linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%)']"
    ).click();
    expect(":iframe .s_map .description").toHaveStyle({
        "background-image": "linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%)",
    });

    // Check Custom tab background color
    await contains("div[data-label='Background Color'] .o_we_color_preview").click();
    await contains(".o_popover .o_font_color_selector .btn-tab:contains('Custom')").click();
    const hexInputEl = await getIframeInput(
        ".o_font_color_selector .o_color_picker_inputs iframe.o_hex_iframe",
        "input[name='hex_input']"
    );
    await contains(hexInputEl).edit("#E4F641");
    expect(":iframe .s_map .description").toHaveStyle({ "background-color": "rgb(228, 246, 65)" });
});

test("clearing the address doesn't crash and hides the map", async () => {
    // Add a map snippet. The template doesn't render its iframe in test mode,
    // so add it as on a real page. Its address comes from the company, which
    // may have none: set one. Commit these changes, as a pending mutation
    // makes the editor warn when the map is selected.
    const { getEditor } = await setupWebsiteBuilderWithSnippet("s_map", {
        loadIframeBuilderTemplates: true,
    });
    queryOne(":iframe .s_map .map_container").prepend(generateGMapIframe());
    queryOne(":iframe .s_map").dataset.mapAddress = "Rue de la Loi 16, Brussels";
    getEditor().shared.history.commit();

    // Select the map. The snippet's SCSS isn't loaded, so the map may have no size.
    await contains(":iframe .s_map", { visible: false }).click();

    // Empty the address. This used to crash because the option looked for a
    // warning that is no longer in the template.
    await contains("[data-label='Address'] input").edit("");
    expect(":iframe .s_map").not.toHaveAttribute("data-map-address");
    expect(":iframe .s_map .s_map_embedded").toHaveClass("d-none");

    // Set an address again. The map is shown again.
    await contains("[data-label='Address'] input").edit("Grand Place, Brussels");
    expect(":iframe .s_map").toHaveAttribute("data-map-address", "Grand Place, Brussels");
    expect(":iframe .s_map .s_map_embedded").not.toHaveClass("d-none");
});

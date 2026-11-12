import { describe, expect, test } from "@odoo/hoot";
import { setupInteractionWhiteList, startInteractions } from "@web/../tests/public/helpers";
import { switchToEditMode } from "../../helpers";

setupInteractionWhiteList("website.dynamic_snippet");

describe.current.tags("interaction_dev");

// A dynamic snippet without a filter, as the template renders it. Its HTML has
// no warning.
const misconfiguredSnippet = `
    <section data-snippet="s_dynamic_snippet" class="s_dynamic_snippet s_dynamic pt32 pb32" data-name="Dynamic Snippet"
            data-template-key="website.dynamic_filter_template_test_item"
            data-number-of-records="16">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <section class="s_dynamic_snippet_content oe_unremovable oe_unmovable o_not_editable col">
                    <div class="dynamic_snippet_template"></div>
                </section>
            </div>
        </div>
    </section>
`;

test("misconfigured dynamic snippet: warning only rendered in edit mode", async () => {
    // Start the public interactions. There is no warning outside edit mode.
    const { core } = await startInteractions(misconfiguredSnippet);
    expect(core.interactions).toHaveLength(1);
    expect(".s_dynamic_snippet .missing_option_warning").toHaveCount(0);

    // Switch to edit mode. The snippet has nothing to show, so the warning is rendered.
    await switchToEditMode(core);
    expect(".s_dynamic_snippet_content > .missing_option_warning").toHaveCount(1);
    expect(".s_dynamic_snippet_content > .missing_option_warning").not.toHaveClass("d-none");

    // Stop the interactions, as the editor does before saving. The warning is removed.
    core.stopInteractions();
    expect(".s_dynamic_snippet .missing_option_warning").toHaveCount(0);
});

test("dynamic snippet without content section starts in edit mode", async () => {
    // Start in edit mode on a snippet without `.s_dynamic_snippet_content`, like
    // the alternative products of the product page.
    const { core } = await startInteractions(
        `
        <section class="s_dynamic_snippet s_dynamic" data-template-key="website.dynamic_filter_template_test_item">
            <div class="container">
                <div class="o_not_editable">
                    <div class="dynamic_snippet_template"></div>
                </div>
            </div>
        </section>
    `,
        { waitForStart: true, editMode: true }
    );

    // Switch to edit mode. It doesn't crash and no warning is added.
    await switchToEditMode(core);
    expect(core.interactions).toHaveLength(1);
    expect(".s_dynamic_snippet .missing_option_warning").toHaveCount(0);
});

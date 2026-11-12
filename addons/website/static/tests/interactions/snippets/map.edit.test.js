import { describe, expect, test } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { setupInteractionWhiteList } from "@web/../tests/public/helpers";
import { switchToEditMode } from "../../helpers";
import { startInteractionsWithSnippet } from "../helpers";

describe.current.tags("interaction_dev");
setupInteractionWhiteList("website.map_edit");

const withoutAddress = (containerEl) => {
    delete containerEl.querySelector(".s_map").dataset.mapAddress;
};
const withAddress = (containerEl) => {
    containerEl.querySelector(".s_map").dataset.mapAddress = "Chaussée de Namur 40, Grand-Rosière";
};
// The warning as saved in pages before it moved to JS. The map option showed it
// when the address was cleared.
const withOldWarning = (containerEl, { visible }) => {
    withoutAddress(containerEl);
    containerEl.querySelector(".map_container").insertAdjacentHTML(
        "afterbegin",
        `<div class="css_non_editable_mode_hidden">
            <div class="missing_option_warning alert alert-info rounded-0 fade show d-print-none ${
                visible ? "" : "d-none"
            }">
                An address must be specified for a map to be embedded
            </div>
        </div>`
    );
};

test("map without address: warning only rendered in edit mode", async () => {
    // Start on a map without an address. Its HTML has no warning, so visitors
    // never receive it.
    const { core } = await startInteractionsWithSnippet("s_map", {
        processHTML: withoutAddress,
        startOptions: { waitForStart: true, editMode: true },
    });
    expect(".s_map .missing_option_warning").toHaveCount(0);

    // Switch to edit mode. The warning is rendered.
    await switchToEditMode(core);
    expect(".s_map .missing_option_warning").toHaveCount(1);

    // Stop the interactions, as the editor does before saving. The warning is removed.
    core.stopInteractions();
    expect(".s_map .missing_option_warning").toHaveCount(0);
});

test("map with an empty address: warning rendered in edit mode", async () => {
    // Start on a map with an empty address, as rendered for a company without
    // an address.
    const { core } = await startInteractionsWithSnippet("s_map", {
        processHTML: (containerEl) => {
            containerEl.querySelector(".s_map").dataset.mapAddress = "";
        },
        startOptions: { waitForStart: true, editMode: true },
    });
    expect(".s_map .missing_option_warning").toHaveCount(0);

    // Switch to edit mode. An empty address counts as no address, so the warning
    // is rendered.
    await switchToEditMode(core);
    expect(".s_map .missing_option_warning").toHaveCount(1);
});

test("map with an address: no warning in edit mode", async () => {
    // Start in edit mode on a map with an address. There is no warning.
    const { core } = await startInteractionsWithSnippet("s_map", {
        processHTML: withAddress,
        startOptions: { waitForStart: true, editMode: true },
    });
    await switchToEditMode(core);
    expect(".s_map .missing_option_warning").toHaveCount(0);

    // Clear the address and restart the snippet's interactions, as the editor
    // does. The warning is rendered.
    const mapEl = queryOne(".s_map");
    delete mapEl.dataset.mapAddress;
    core.stopInteractions(mapEl);
    await core.startInteractions(mapEl);
    expect(".s_map .missing_option_warning").toHaveCount(1);
});

test("map saved with the old warning shown: no second warning in edit mode", async () => {
    // Start on a map without an address, saved with the old warning shown.
    const { core } = await startInteractionsWithSnippet("s_map", {
        processHTML: (containerEl) => withOldWarning(containerEl, { visible: true }),
        startOptions: { waitForStart: true, editMode: true },
    });

    // Switch to edit mode. The old warning is enough, no new one is rendered.
    await switchToEditMode(core);
    expect(".s_map .missing_option_warning").toHaveCount(1);
});

test("map saved with the old warning hidden: new warning in edit mode", async () => {
    // Start on a map without an address, saved with the old warning hidden.
    const { core } = await startInteractionsWithSnippet("s_map", {
        processHTML: (containerEl) => withOldWarning(containerEl, { visible: false }),
        startOptions: { waitForStart: true, editMode: true },
    });

    // Switch to edit mode. Nothing shows the old warning anymore, so the new one
    // is rendered.
    await switchToEditMode(core);
    expect(".s_map .missing_option_warning:not(.d-none)").toHaveCount(1);
    expect(".s_map .missing_option_warning").toHaveCount(2);
});

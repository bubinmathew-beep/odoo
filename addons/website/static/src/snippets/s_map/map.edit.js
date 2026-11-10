import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class MapEdit extends Interaction {
    // The template renders `data-map-address=""` for a company without an address.
    static selector = ".s_map:not([data-map-address]), .s_map[data-map-address='']";

    start() {
        // Pages saved before the warning moved to JS can still contain it.
        if (this.el.querySelector(".missing_option_warning:not(.d-none)")) {
            return;
        }
        this.renderAt(
            "website.s_map.missing_option_warning",
            {},
            this.el.querySelector(".map_container"),
            "afterbegin"
        );
    }
}

registry.category("public.interactions.edit").add("website.map_edit", {
    Interaction: MapEdit,
});

import { Component, computed, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class SidePanelToggle extends Component {
    static template = "web.SidePanelToggle";

    props = useProps({
        folded: t.boolean(),
        side: t.selection(["start", "end"]),
        onToggle: t.function(),
    });

    label = computed(() =>
        this.props.folded ? _t("Expand side panel") : _t("Collapse side panel")
    );
}

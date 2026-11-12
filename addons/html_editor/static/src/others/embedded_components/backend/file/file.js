import { proxy, signal } from "@odoo/owl";
import { useLayoutEffect } from "@web/owl2/utils";
import {
    applyObjectPropertyDifference,
    getEmbeddedProps,
    StateChangeManager,
    useEmbeddedState,
} from "@html_editor/others/embedded_component_utils";
import { ReadonlyEmbeddedFileComponent } from "@html_editor/others/embedded_components/core/file/readonly_file";
import { RenameDialog } from "./rename_dialog";

export class EmbeddedFileComponent extends ReadonlyEmbeddedFileComponent {
    static template = "html_editor.EmbeddedFile";

    nameInput = signal.ref();
    nameContainer = signal.ref();

    setup() {
        super.setup();
        // override the state by an embedded state.
        this.state = useEmbeddedState(this.props.host);
        this.fileModel.state = this.state;
        this.localState = proxy({
            editFileName: false,
            nameWidth: 0,
        });
        useLayoutEffect(
            () => {
                if (this.localState.editFileName) {
                    const nameInput = this.nameInput();
                    nameInput?.focus();
                    nameInput?.select();
                }
            },
            () => [this.localState.editFileName]
        );
    }

    onBlurNameInput(ev) {
        this.localState.editFileName = false;
        this.renameFile(this.nameInput()?.value);
    }

    onFocusFileName(ev) {
        // The input replaces the file name: give it the same width, so that
        // the file box keeps its width.
        this.localState.nameWidth = this.nameContainer()?.getBoundingClientRect().width || 0;
        this.localState.editFileName = true;
    }

    onKeydownNameInput(ev) {
        if (ev.key !== "Enter") {
            return;
        } else {
            ev.preventDefault();
        }
        if (this.renameFile(this.nameInput()?.value)) {
            this.localState.editFileName = false;
            this.env.editorShared?.setSelectionAfter(this.props.host);
        }
    }
    onFileRename() {
        if (!this.isPreviewShown) {
            // The file name is visible: edit it in place, as when clicking on
            // it. Wait for the dropdown to close first, as it puts the focus
            // back on its toggler when closing, which would blur the input.
            Promise.resolve().then(() => this.onFocusFileName());
            return;
        }
        // The preview replaces the file box: use a dialog.
        this.dialogService.add(RenameDialog, {
            filename: this.fileModel.filename,
            rename: this.renameFile.bind(this),
        });
    }
    onFileRemove() {
        this.env.editorShared?.remove(this.props.host);
    }
    toggleInlinePreview() {
        this.state.isPreviewInline = !this.state.isPreviewInline;
        this.env.editorShared?.setSelectionAfter(this.props.host);
        this.hideSettingsOverlay();
        // The preview is toggled from the settings dropdown, which takes the
        // focus out of the editable. Give it back, otherwise the editor would
        // do it on the next interaction, e.g. blurring the file name input
        // right after it got focused.
        // Wait for the dropdown to close first, as it puts the focus back
        // on its toggler when closing.
        Promise.resolve().then(() => this.env.editorShared?.focusEditable());
    }

    /**
     * @param {string} [newName]
     * @returns {boolean} whether the name is valid
     */
    renameFile(newName = "") {
        if (!newName.length) {
            return false;
        }
        if (newName === this.fileModel.filename) {
            return true;
        }
        // filename is the name of the file as written in the editor by the
        // user. It does not necessarily have the file extension.
        this.fileModel.filename = newName;
        if (this.fileModel.extension) {
            const pattern = new RegExp(`\\.${this.fileModel.extension}$`, "i");
            if (!newName.match(pattern)) {
                newName += `.${this.fileModel.extension}`;
            }
        }
        // name is the full name of the file (always with extension)
        // and is used as the url queryParam when downloading it.
        this.fileModel.name = newName;
        return true;
    }
}

export const fileEmbedding = {
    name: "file",
    Component: EmbeddedFileComponent,
    getProps: (host) => ({ host, ...getEmbeddedProps(host) }),
    getStateChangeManager: (config) =>
        new StateChangeManager(
            Object.assign(config, {
                propertyUpdater: {
                    fileData: (state, previous, next) => {
                        applyObjectPropertyDifference(
                            state,
                            "fileData",
                            previous.fileData,
                            next.fileData
                        );
                    },
                },
            })
        ),
};

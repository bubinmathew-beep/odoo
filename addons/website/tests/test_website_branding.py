# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
from unittest.mock import patch

from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import new_test_user

from odoo.addons.base.tests.common import BaseCommon

MINIMAL_GIF = base64.b64decode(
    b"R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
)


class TestWebsiteBranding(BaseCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_a = cls.env["res.company"].create({"name": "Company A"})

        cls.website = cls.env["website"].create(
            {
                "name": "Test Website",
                "company_id": cls.company_a.id,
            },
        )

        cls.designer_user = new_test_user(
            cls.env,
            login="designer_test",
            groups="website.group_website_designer",
            company_id=cls.company_a.id,
            company_ids=[Command.set([cls.company_a.id])],
        )

        # Can open the editor, but has no write access on websites.
        cls.restricted_editor = new_test_user(
            cls.env,
            login="restricted_editor_test",
            groups="website.group_website_restricted_editor",
        )

        cls.valid_image = cls.env["ir.attachment"].create(
            {
                "name": "logo.gif",
                "raw": MINIMAL_GIF,
                "mimetype": "image/gif",
                "company_id": cls.company_a.id,
                "public": True,
            },
        )

    def test_branding_input_validation(self):
        """The name is saved stripped, and an empty name is refused."""
        website = self.website.with_user(self.designer_user)

        # A name with spaces around is saved stripped.
        result = website.update_branding({"name": "  Clean Name  "})
        self.assertEqual(website.name, "Clean Name")
        # Every website gets a default favicon on create.
        self.assertEqual(result, {"name": "Clean Name", "has_favicon": True, "errors": {}})

        # Empty names are refused with a reason, and not written.
        for empty_name in ("   ", ""):
            with self.subTest(name=empty_name):
                result = website.update_branding({"name": empty_name})
                self.assertIn("name", result["errors"])
                self.assertEqual(website.name, "Clean Name", "Rejected names should not be written")

        # Values that are not a dict are a programming error.
        with self.assertRaises(ValidationError):
            website.update_branding("name")

    def test_branding_unchanged_name_not_written(self):
        """Saving the name the website already has writes nothing."""
        website = self.website.with_user(self.designer_user)
        Website = self.registry["website"]

        with patch.object(Website, "write", autospec=True, side_effect=Website.write) as write:
            # The saved name, with spaces around: no write, no error.
            result = website.update_branding({"name": f"  {website.name} "})
            self.assertEqual(result["errors"], {})
            write.assert_not_called()

            # A new name is written, which shows that the patch catches writes.
            website.update_branding({"name": "Other Name"})
            write.assert_called_once()

    def test_branding_media_resolution(self):
        """The image fields get the attachment's data. Bad references are refused."""
        website = self.website.with_user(self.designer_user)

        # The logo gets the data of the attachment.
        website.update_branding({"logo": self.valid_image.id})
        self.assertEqual(website.logo.content, MINIMAL_GIF, "The logo should be the attachment data")

        # The logo can't be removed, but the favicon can.
        result = website.update_branding({"logo": False})
        self.assertIn("logo", result["errors"])
        website.update_branding({"favicon": self.valid_image.id})
        result = website.update_branding({"favicon": False})
        self.assertFalse(result["has_favicon"])
        self.assertFalse(website.favicon)

        # An attachment that isn't an image, a missing attachment and invalid
        # references are refused.
        invalid_doc = self.env["ir.attachment"].create(
            {
                "name": "document.pdf",
                "raw": b"pdf_data",
                "mimetype": "application/pdf",
                "company_id": self.company_a.id,
                "public": True,
            },
        )
        for bad_ref in (invalid_doc.id, 999999, None, True, 0, "42"):
            with self.subTest(ref=bad_ref):
                result = website.update_branding({"favicon": bad_ref})
                self.assertIn("favicon", result["errors"])

    def test_branding_refused_field_does_not_block_the_others(self):
        """A refused field is reported, and the valid fields are saved anyway."""
        website = self.website.with_user(self.designer_user)

        # A valid name and logo, and a favicon whose data is not a real image.
        not_an_image = self.env["ir.attachment"].create(
            {"name": "fake.png", "raw": b"not an image", "mimetype": "image/png", "public": True},
        )
        result = website.update_branding(
            {"name": "Saved Name", "favicon": not_an_image.id, "logo": self.valid_image.id},
        )

        # The favicon's data isn't a real image, so its processing on write
        # refuses it. The name and the logo are saved.
        self.assertEqual(list(result["errors"]), ["favicon"])
        self.assertEqual(website.name, "Saved Name")
        self.assertEqual(website.logo.content, MINIMAL_GIF)

    def test_branding_refused_field_is_rolled_back(self):
        """A field refused after it was written, for example by an override of
        write, is rolled back."""
        logo_before = self.website.logo.content
        website_write = self.registry["website"].write

        def write_then_fail(records, vals):
            result = website_write(records, vals)
            if "logo" in vals:
                raise UserError("Refused after the write")
            return result

        # The logo write goes through, then fails; the name is saved.
        self.patch(self.registry["website"], "write", write_then_fail)
        website = self.website.with_user(self.designer_user)
        result = website.update_branding({"name": "Kept Name", "logo": self.valid_image.id})

        # The logo is reported and rolled back, the name is kept.
        self.assertEqual(result["errors"], {"logo": "Refused after the write"})
        self.env.invalidate_all()
        self.assertEqual(self.website.logo.content, logo_before, "The refused logo should be rolled back")
        self.assertEqual(self.website.name, "Kept Name")

    def test_branding_url_attachment_rejected(self):
        """An image added by URL that the browser could not download is stored
        as a link without data. It is refused and doesn't empty the logo or the
        favicon."""
        website = self.website.with_user(self.designer_user)
        # The website has a logo and a favicon.
        website.update_branding({"logo": self.valid_image.id, "favicon": self.valid_image.id})
        url_image = self.env["ir.attachment"].create(
            {
                "name": "remote.png",
                "type": "url",
                "url": "https://example.com/remote.png",
                "mimetype": "image/png",
                "public": True,
            },
        )

        # Picking the image stored as a link is refused, and the field keeps
        # its image.
        for field in ("logo", "favicon"):
            with self.subTest(field=field):
                result = website.update_branding({field: url_image.id})
                self.assertIn("only a link", result["errors"][field])
                self.assertTrue(website[field], "The refused link should not empty the field")

    def test_branding_empty_attachment_rejected(self):
        """An uploaded image with no data is refused as empty, not as a link."""
        empty_image = self.env["ir.attachment"].create(
            {"name": "empty.png", "raw": b"", "mimetype": "image/png", "public": True},
        )
        website = self.website.with_user(self.designer_user)
        result = website.update_branding({"logo": empty_image.id})
        self.assertEqual(result["errors"], {"logo": "The selected image is empty."})

    def test_branding_access_rights(self):
        """Restricted editors can open the editor but not write the website, so
        the whole call is refused."""
        website = self.website.with_user(self.restricted_editor)
        with self.assertRaises(AccessError):
            website.update_branding({"name": "Hacked Name"})

    def test_branding_private_attachment(self):
        """A designer cannot copy into the logo an attachment they cannot read.
        The reason is the same as for a missing attachment."""
        # A private attachment, linked to no record, created by another user:
        # only its creator and admins can read it.
        private_image = self.env["ir.attachment"].create(
            {
                "name": "private.gif",
                "raw": MINIMAL_GIF,
                "mimetype": "image/gif",
                "public": False,
            },
        )
        website = self.website.with_user(self.designer_user)

        # The designer picks it as logo, then a missing attachment. Both get the
        # same reason, and the logo doesn't change.
        logo_before = self.website.logo.content
        private_result = website.update_branding({"logo": private_image.id})
        missing_result = website.update_branding({"logo": 999999})
        self.assertEqual(private_result["errors"]["logo"], missing_result["errors"]["logo"])
        self.assertEqual(self.website.logo.content, logo_before, "The logo should not change")

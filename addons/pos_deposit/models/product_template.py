# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.fields import Domain


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    is_deposit = fields.Boolean(string='Is Deposit', help='This product is used as a deposit product.')
    deposit_product_id = fields.Many2one(
        'product.product',
        string='Deposit Product',
        ui_domain="[('is_deposit', '=', True), ('available_in_pos', '=', True)]",
        help='The deposit product that is added when this product is sold.',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        return super()._load_pos_data_fields(config) + ['is_deposit', 'deposit_product_id']

    @api.model
    def _load_pos_data_domain(self, data):
        domain = super()._load_pos_data_domain(data)
        deposit_templates = self.search_fetch(
            Domain.AND([domain, [('deposit_product_id', '!=', False)]]),
            ['deposit_product_id'],
        ).deposit_product_id.product_tmpl_id
        if not deposit_templates:
            return domain
        return Domain.OR([
            domain,
            [('id', 'in', deposit_templates.ids), ('available_in_pos', '=', True)],
        ])

    @api.constrains('is_deposit', 'deposit_product_id')
    def _check_deposit_product(self):
        for product in self:
            if product.is_deposit and product.deposit_product_id:
                raise ValidationError(_("A deposit product cannot have another deposit product."))

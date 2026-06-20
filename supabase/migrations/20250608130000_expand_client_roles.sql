-- Expand representation_agreement_clients.client_role allowed values
-- to support listing agreement seller/landlord roles.

alter table public.representation_agreement_clients
  drop constraint representation_agreement_clients_client_role_check;

alter table public.representation_agreement_clients
  add constraint representation_agreement_clients_client_role_check
    check (
      client_role in (
        'PRIMARY',
        'CO_CLIENT',
        'SPOUSE',
        'POWER_OF_ATTORNEY',
        'BUYER',
        'TENANT',
        'SELLER',
        'LANDLORD',
        'OTHER'
      )
    );

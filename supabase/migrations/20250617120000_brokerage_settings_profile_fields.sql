-- Align brokerage_settings with agent/broker profile field names for Settings UI
-- and future field resolution.

alter table public.brokerage_settings
  add column if not exists agent_first_name varchar(100),
  add column if not exists agent_middle_name varchar(100),
  add column if not exists agent_last_name varchar(100),
  add column if not exists agent_address varchar(255),
  add column if not exists agent_city varchar(100),
  add column if not exists agent_state char(2),
  add column if not exists agent_zip varchar(20),
  add column if not exists broker_first_name varchar(100),
  add column if not exists broker_middle_name varchar(100),
  add column if not exists broker_last_name varchar(100),
  add column if not exists brokerage_address varchar(255),
  add column if not exists brokerage_office_phone varchar(30);

update public.brokerage_settings
set
  brokerage_address = coalesce(
    brokerage_address,
    nullif(
      trim(
        concat_ws(
          ', ',
          nullif(trim(brokerage_address1), ''),
          nullif(trim(brokerage_address2), '')
        )
      ),
      ''
    )
  ),
  brokerage_office_phone = coalesce(brokerage_office_phone, brokerage_phone)
where status = 'ACTIVE';

alter table public.brokerage_settings
  drop column if exists agent_name,
  drop column if exists broker_name,
  drop column if exists brokerage_address1,
  drop column if exists brokerage_address2,
  drop column if exists brokerage_phone;

update public.brokerage_settings
set
  agent_first_name = coalesce(agent_first_name, 'Kenneth'),
  agent_middle_name = coalesce(agent_middle_name, 'Lee'),
  agent_last_name = coalesce(agent_last_name, 'Harbaugh'),
  agent_license_number = coalesce(agent_license_number, '0712335'),
  agent_phone = coalesce(agent_phone, '817-881-4768'),
  agent_email = coalesce(agent_email, 'lee@harbaughbrothers.com'),
  brokerage_name = coalesce(brokerage_name, 'Davey Goosmann Realty'),
  brokerage_address = coalesce(brokerage_address, '600 Strata Cir. #212'),
  brokerage_city = coalesce(brokerage_city, 'Mansfield'),
  brokerage_state = coalesce(brokerage_state, 'TX'),
  brokerage_zip = coalesce(brokerage_zip, '76063'),
  brokerage_office_phone = coalesce(brokerage_office_phone, '817-539-9434'),
  broker_first_name = coalesce(broker_first_name, 'Dee'),
  broker_middle_name = coalesce(broker_middle_name, ''),
  broker_last_name = coalesce(broker_last_name, 'Davey'),
  broker_license_number = coalesce(broker_license_number, '0283607'),
  broker_phone = coalesce(broker_phone, '817-228-8150'),
  broker_email = coalesce(broker_email, 'deedavey50@gmail.com')
where status = 'ACTIVE';

insert into public.brokerage_settings (
  agent_first_name,
  agent_middle_name,
  agent_last_name,
  agent_license_number,
  agent_phone,
  agent_email,
  brokerage_name,
  brokerage_address,
  brokerage_city,
  brokerage_state,
  brokerage_zip,
  brokerage_office_phone,
  broker_first_name,
  broker_middle_name,
  broker_last_name,
  broker_license_number,
  broker_phone,
  broker_email
)
select
  'Kenneth',
  'Lee',
  'Harbaugh',
  '0712335',
  '817-881-4768',
  'lee@harbaughbrothers.com',
  'Davey Goosmann Realty',
  '600 Strata Cir. #212',
  'Mansfield',
  'TX',
  '76063',
  '817-539-9434',
  'Dee',
  '',
  'Davey',
  '0283607',
  '817-228-8150',
  'deedavey50@gmail.com'
where not exists (
  select 1
  from public.brokerage_settings
  where status = 'ACTIVE'
);

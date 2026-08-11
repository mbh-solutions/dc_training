alter default privileges for role postgres in schema public
grant select on tables to dc_training_backup;
alter default privileges for role postgres in schema private
grant select on tables to dc_training_backup;

alter default privileges for role postgres in schema public
grant usage, select on sequences to dc_training_backup;
alter default privileges for role postgres in schema private
grant usage, select on sequences to dc_training_backup;

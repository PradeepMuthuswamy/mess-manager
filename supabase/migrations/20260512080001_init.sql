-- Initial migration: extensions, schemas, enums, helper functions

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

do $$ begin
  create type public.user_role as enum ('user','manager','unit_admin','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_category as enum ('ration','soft_drink','alcohol','cigar','grocery');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.uom as enum ('kg','g','l','ml','piece','pack','bottle');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.capability as enum (
    'masters.read','masters.write','masters.write.global',
    'attendance.read','attendance.write','attendance.finalize',
    'ration.read','ration.issue','ration.adjust',
    'bar.read','bar.write','bar.finalize',
    'rooms.read','rooms.booking.write','rooms.manage',
    'parties.read','parties.write','parties.finalize',
    'users.read','users.invite','users.manage',
    'reports.unit','reports.cross_unit',
    'billing.read','billing.draft','billing.finalize'
  );
exception when duplicate_object then null; end $$;

create or replace function app.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

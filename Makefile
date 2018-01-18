# Copyright 2018 Jiří Janoušek <janousek.jiri@gmail.com>
# Licensed under BSD-2-Clause - see the LICENSE file.

UID = gs-pstatectl@tiliado.eu
DESTDIR ?=
PREFIX ?= /usr/local
DEST = $(DESTDIR)$(PREFIX)/share/gnome-shell/extensions/$(UID)

fix:
	standard -v --fix

check:
	standard -v

install: check
	mkdir -pv $(DEST)
	cp -vf extension.js metadata.json LICENSE stylesheet.css $(DEST)

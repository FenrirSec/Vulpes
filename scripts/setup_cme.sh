#!/bin/bash

git clone https://github.com/byt3bl33d3r/CrackMapExec.git

cd CrackMapExec

apk add poetry python3-dev libjpeg jpeg-dev rust cargo

sed -i 's/sqlalchemy = "^2.0.4"/sqlalchemy = ">2.0.4"/g' pyproject.toml

poetry install

poetry run cme

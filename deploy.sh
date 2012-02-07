#!/bin/bash

username=santiago
application=MyGeo
token=8456708d-9f74-408f-9e61-291e2217b2bf
env=${1-dev}
TMPFILE=$(mktemp -tu sencha.XXXXXXXXXXXXXXXX)".zip"

echo "Hello, $username"
echo -n "To upload and deploy new version of $application hit [ENTER]"
read
zip -r $TMPFILE ./ -x .git .* $application.sh 
curl --insecure --form file=@$TMPFILE https://sencha-dev.io/deploy/$token/$env


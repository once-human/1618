"""
Builds "Good Morning", the iPhone Shortcut behind "Hey Siri, good morning".

    python3 scripts/shortcuts/goodmorning.py            # writes good-morning.plist
    python3 scripts/shortcuts/goodmorning.py --sign     # also signs it -> Good Morning.shortcut
    curl -X PUT --data-binary @"Good Morning.shortcut" \\
         -H "Authorization: Bearer $ADMIN_SECRET" \\
         https://www.onkaryaglewad.in/api/shortcuts/goodmorning

Siri runs a shortcut when you say its name, so a shortcut called "Good Morning"
answers "Hey Siri, good morning" in place of Siri's own reply. It does two
things: tells the site I'm up (DELETE /api/bedtime, which stamps the wake
time on last night's sleep), then gives Siri a good-morning line to say, picked at random, in her own voice (Show Result is
spoken aloud when a shortcut runs from Siri).

The file holds no secret: the site key is asked for when the shortcut is added.
"""

import json
import plistlib
import sys
import time
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from build import attachment, dict_field, out, plain, token, u  # noqa: E402

NAME = "Good Morning"
ENDPOINT = "https://www.onkaryaglewad.in/api/bedtime"
LINES = ["Good morning, Onkar.", "Good morning. Let's go.", "Morning, Onkar.", "Good morning. Hope you slept well.", "Rise and shine."]


def build():
    key_id, auth_id, list_id, pick_id = u(), u(), u(), u()
    actions = [
        {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {
            "UUID": key_id, "CustomOutputName": "Site key", "WFTextActionText": ""}},
        {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {
            "UUID": auth_id, "CustomOutputName": "Authorization", "WFTextActionText": token("Bearer ", out("Site key", key_id))}},
        # Up, just now.
        {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl", "WFWorkflowActionParameters": {
            "UUID": u(),
            "WFURL": ENDPOINT,
            "WFHTTPMethod": "DELETE",
            "WFHTTPHeaders": dict_field([("Authorization", token("", out("Authorization", auth_id)))]),
            "ShowHeaders": True}},
        # What Siri says back.
        {"WFWorkflowActionIdentifier": "is.workflow.actions.list", "WFWorkflowActionParameters": {
            "UUID": list_id, "CustomOutputName": "Lines",
            "WFItems": [{"WFItemType": 0, "WFValue": plain(line)} for line in LINES]}},
        {"WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist", "WFWorkflowActionParameters": {
            "UUID": pick_id, "CustomOutputName": "Line",
            "WFInput": attachment(out("Lines", list_id)),
            "WFItemSpecifier": "Random Item"}},
        {"WFWorkflowActionIdentifier": "is.workflow.actions.showresult", "WFWorkflowActionParameters": {
            "UUID": u(), "Text": token("", out("Line", pick_id))}},
    ]
    return {
        "WFWorkflowClientVersion": "5037.0.17",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        # A sun, warm yellow.
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59447, "WFWorkflowIconStartColor": 4282601983},
        "WFWorkflowImportQuestions": [{
            "ActionIndex": 0, "Category": "Parameter", "DefaultValue": "", "ParameterKey": "WFTextActionText",
            "Text": "Paste your site key (ADMIN_SECRET from Vercel). It stays inside this shortcut on your phone."}],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowNoInputBehavior": {},
        "WFWorkflowActions": actions,
    }


def sign(xml: bytes) -> bytes:
    req = urllib.request.Request(
        "https://hubsign.routinehub.services/sign",
        data=json.dumps({"shortcutName": NAME, "shortcut": xml.decode()}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "cherri/2.3.0"},
    )
    for attempt in range(5):  # HubSign sometimes says no for a moment
        try:
            signed = urllib.request.urlopen(req, timeout=60).read()
            if signed[:4] == b"AEA1":
                return signed
        except Exception:
            pass
        time.sleep(5 * (attempt + 1))
    sys.exit("signing failed: response isn't a signed shortcut")


if __name__ == "__main__":
    xml = plistlib.dumps(build(), fmt=plistlib.FMT_XML)
    open("good-morning.plist", "wb").write(xml)
    print("wrote good-morning.plist")
    if "--sign" in sys.argv:
        signed = sign(xml)
        open(f"{NAME}.shortcut", "wb").write(signed)
        print(f"wrote {NAME}.shortcut ({len(signed)} bytes, signed)")

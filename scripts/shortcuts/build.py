"""
Builds "1618 Health", the iPhone Shortcut that sends today's steps, distance
and active calories from Apple Health to the site.

    python3 scripts/shortcuts/build.py            # writes 1618-health.plist
    python3 scripts/shortcuts/build.py --sign     # also signs it -> 1618-health.shortcut
    curl -X PUT --data-binary @1618-health.shortcut \
         -H "Authorization: Bearer $ADMIN_SECRET" \
         https://www.onkaryaglewad.in/api/shortcuts/health

iPhones only import signed shortcuts. Signing needs a Mac (`shortcuts sign
--mode anyone`) or RoutineHub's HubSign service, which --sign uses. The file
holds no secret: the site key is asked for when the shortcut is added.

What it does, in order (each number is sent on its own, so if one Health type
is named differently on some iOS version, the ones before it still arrive):

    Text: <site key>                      (filled in by the import question)
    Text: "Bearer <site key>"
    for Steps, Walking + Running Distance, Active Energy:
        Find Health Samples where Type is <type> and Start Date is today,
            grouped by Day (Health's own deduplicated daily total)
        Get Details of Health Sample: Value
        Get Contents of URL: POST {field: value} to /api/ingest/health

The Health action's format comes from a real exported shortcut; the rest
matches what Cherri (github.com/electrikmilk/cherri) generates.
"""

import datetime
import json
import plistlib
import sys
import urllib.request
import uuid

OBJ = "￼"  # where a variable sits inside a text field
ENDPOINT = "https://www.onkaryaglewad.in/api/ingest/health"
NAME = "1618 Health"


def u():
    return str(uuid.uuid4()).upper()


def out(name, uid):
    return {"OutputName": name, "OutputUUID": uid, "Type": "ActionOutput"}


def token(prefix, ref):
    return {
        "Value": {"attachmentsByRange": {"{%d, 1}" % len(prefix): ref}, "string": prefix + OBJ},
        "WFSerializationType": "WFTextTokenString",
    }


def plain(s):
    return {"Value": {"string": s}, "WFSerializationType": "WFTextTokenString"}


def attachment(ref):
    return {"Value": ref, "WFSerializationType": "WFTextTokenAttachment"}


def dict_field(items):
    return {
        "Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": plain(k), "WFValue": v} for k, v in items]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def build():
    actions = []
    key_id, auth_id = u(), u()
    actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {
        "UUID": key_id, "CustomOutputName": "Site key", "WFTextActionText": ""}})
    actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {
        "UUID": auth_id, "CustomOutputName": "Authorization", "WFTextActionText": token("Bearer ", out("Site key", key_id))}})

    now = datetime.datetime.now().replace(microsecond=0)

    def health(type_name, field):
        find_id, val_id = u(), u()
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.filter.health.quantity", "WFWorkflowActionParameters": {
            "UUID": find_id,
            "WFContentItemFilter": {"Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Property": "Type", "Operator": 4, "VariableOverrides": {}, "Enumeration": type_name,
                     "Removable": False, "Bounded": True},
                    # 1002 = "is today" (the same numbering If conditions use, where 4 = "is")
                    {"Property": "Start Date", "Operator": 1002, "VariableOverrides": {}, "Removable": False,
                     "Bounded": True, "Date": now, "AnotherDate": now, "Number": 1, "Unit": 16},
                ]}, "WFSerializationType": "WFContentPredicateTableTemplate"},
            "WFHKSampleFilteringGroupBy": "Day",
        }})
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.properties.health.quantity", "WFWorkflowActionParameters": {
            "UUID": val_id, "CustomOutputName": field,
            "WFInput": attachment(out("Health Samples", find_id)),
            "WFContentItemPropertyName": "Value"}})
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl", "WFWorkflowActionParameters": {
            "UUID": u(),
            "WFURL": ENDPOINT,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dict_field([("Authorization", token("", out("Authorization", auth_id)))]),
            "WFJSONValues": dict_field([(field, token("", out(field, val_id)))]),
            "ShowHeaders": True}})

    health("Steps", "steps")
    health("Walking + Running Distance", "distanceKm")
    health("Active Energy", "activeKcal")

    return {
        "WFWorkflowClientVersion": "5037.0.17",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59754, "WFWorkflowIconStartColor": 4292093695},
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


if __name__ == "__main__":
    xml = plistlib.dumps(build(), fmt=plistlib.FMT_XML)
    open("1618-health.plist", "wb").write(xml)
    print("wrote 1618-health.plist")
    if "--sign" in sys.argv:
        req = urllib.request.Request(
            "https://hubsign.routinehub.services/sign",
            data=json.dumps({"shortcutName": NAME, "shortcut": xml.decode()}).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "1618-build"},
        )
        signed = urllib.request.urlopen(req, timeout=60).read()
        if signed[:4] != b"AEA1":
            sys.exit("signing failed: response isn't a signed shortcut")
        open("1618-health.shortcut", "wb").write(signed)
        print(f"wrote 1618-health.shortcut ({len(signed)} bytes, signed)")

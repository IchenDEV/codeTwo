# Instance diagnosis and Incident response

Start from an actual report, runtime identity, and observed signal. Follow the
[instance preflight and ownership rules](desktop-instances.md) before launching or restarting the
desktop. For the tracked local launcher, `./script/dev/run.sh --logs` and `--telemetry` inspect
state; `--restart` stops and rebuilds it and requires that action to be within the user's request.

For a remote node, identify its workspace, data directory, listener and pairing state using the
[remote guide](remote-agent.md). `/health` is a readiness probe, not proof that provider turns or
handoff work. Keep credentials out of evidence. A read-only diagnosis may recommend recovery;
executing it requires authorization for the affected instance and action.

Create an Incident only for a confirmed event:

```sh
./script/devflow incident provider-recovery monitor
./script/devflow add-eval provider-recovery incident
```

`incident` creates the Incident and one linked follow-up change. Record detection, impact, facts
versus hypotheses, action authorization, recovery verdict and actual evidence in that record.
Resolved/closed Incidents require a follow-up change and regression Eval link, or a concrete
`Blocked:` reason. Recovery does not grant permission to close an Incident or publish a fix.
The [development workflow](../../codetwo-develop/references/workflow.md) owns follow-up acceptance
and the [release Skill](../../codetwo-release/SKILL.md) owns authorized package publication.

CodeTwo has no repository-owned production monitor-to-Incident integration. Detection remains
unconnected until a real source, deterministic threshold, destination and authorized response path
exist. Do not create recurring jobs or test notifications from this guide alone.

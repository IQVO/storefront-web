{{/*
Expand the name of the chart.
*/}}
{{- define "storefront-web.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "storefront-web.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version as used by the chart label.
*/}}
{{- define "storefront-web.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "storefront-web.labels" -}}
helm.sh/chart: {{ include "storefront-web.chart" . }}
{{ include "storefront-web.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels. The Deployment and the Service also pin
app.kubernetes.io/component (web): a Service selecting on these two alone would
select every component a future change adds.
*/}}
{{- define "storefront-web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "storefront-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "storefront-web.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "storefront-web.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference. An empty image.tag means "v" + appVersion, the tag the
release job publishes.
*/}}
{{- define "storefront-web.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default (printf "v%s" .Chart.AppVersion) }}
{{- end }}

{{/*
MANDATORY: the SSR loaders and the /api/storefront proxy call the
storefront-bff at BFF_URL (server/index.ts, app/lib/api.server.ts). Fails the
render naming the value instead of serving 502s.
*/}}
{{- define "storefront-web.requireBff" -}}
{{- $_ := required "storefront-web requires config.bffUrl to be set (BFF_URL): the storefront-bff is the only backend, the SSR loaders and the /api/storefront proxy call it and there is no default in a deployed runtime." .Values.config.bffUrl -}}
{{- end -}}

{{/*
The port of PORT is the container port the probes and the Service target.
*/}}
{{- define "storefront-web.requirePort" -}}
{{- if ne (toString .Values.config.port) (toString .Values.service.targetPort) -}}
{{- fail (printf "config.port is %v but service.targetPort is %v: the container port, the probes and the Service must agree." .Values.config.port .Values.service.targetPort) -}}
{{- end -}}
{{- end -}}

{{/*
extraEnv may not bring back what the chart owns: no STOREFRONT_STUB (the
in-memory stub BFF exists for local CI and demos; a deployed storefront-web
always talks to a real storefront-bff) and none of the variables the chart
renders itself (the same variable is never set twice).
*/}}
{{- define "storefront-web.requireCleanExtraEnv" -}}
{{- $owned := list "BFF_URL" "PORT" "COOKIE_SECURE" -}}
{{- range .Values.extraEnv -}}
{{- $name := toString .name -}}
{{- if eq $name "STOREFRONT_STUB" -}}
{{- fail "extraEnv sets STOREFRONT_STUB: the stub BFF is an in-memory fake for local CI and demos (npm run start:stub) and is never a deployed runtime; set config.bffUrl to a real storefront-bff." -}}
{{- end -}}
{{- if has $name $owned -}}
{{- fail (printf "extraEnv sets %s, which the chart renders from its own values: use that value instead." $name) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Every render-time requirement of the real runtime, in one include. The web
Deployment (always rendered) includes it, so a mis-set release fails
`helm template` / `helm install`.
*/}}
{{- define "storefront-web.requireRealRuntime" -}}
{{- include "storefront-web.requireBff" . -}}
{{- include "storefront-web.requirePort" . -}}
{{- include "storefront-web.requireCleanExtraEnv" . -}}
{{- end -}}

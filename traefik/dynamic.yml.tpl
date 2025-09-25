http:
  routers:
    exam:
      rule: PathPrefix(`/`)
      service: exam-__ACTIVE_COLOR__
      entryPoints:
        - web
  services:
    exam-blue:
      loadBalancer:
        servers:
          - url: http://app-blue:8080
    exam-green:
      loadBalancer:
        servers:
          - url: http://app-green:8080

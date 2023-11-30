## ARM64
FROM --platform=linux/arm64 quay.io/keycloak/keycloak:22.0.5 as builder

## Enable health and metrics support
# ENV KC_HEALTH_ENABLED=true
# ENV KC_METRICS_ENABLED=true
USER keycloak
WORKDIR /opt/keycloak
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:22.0.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/

## Add dependencies https://www.keycloak.org/server/containers#_installing_additional_rpm_packages
ADD --chown=keycloak:keycloak https://repo1.maven.org/maven2/org/jgroups/aws/jgroups-aws/2.0.1.Final/jgroups-aws-2.0.1.Final.jar /opt/keycloak/providers/jgroups-aws-2.0.1.Final.jar
ADD --chown=keycloak:keycloak https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-core/1.12.410/aws-java-sdk-core-1.12.410.jar  /opt/keycloak/providers/aws-java-sdk-core-1.12.410.jar
ADD --chown=keycloak:keycloak https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-s3/1.12.410/aws-java-sdk-s3-1.12.410.jar   /opt/keycloak/providers/aws-java-sdk-s3-1.12.410.jar
ADD --chown=keycloak:keycloak https://repo1.maven.org/maven2/joda-time/joda-time/2.12.2/joda-time-2.12.2.jar  /opt/keycloak/providers/joda-time-2.12.2.jar

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
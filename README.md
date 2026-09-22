# DataRelay Grant

**Human approval before automation executes.**

DataRelay Grant is an upcoming DataRelay Labs product for approval-driven automation and execution control.

The product direction is based on the patented approval-management workflow described in:

| Jurisdiction | Patent | Title | Priority | Grant / publication |
| --- | --- | --- | --- | --- |
| United States | [US 12,056,667 B1](https://patents.google.com/patent/US12056667B1/en) | System for managing approval request using email and the operating method thereof | 2023-03-13 | 2024-08-06 |
| Republic of Korea | [KR 10-2567118 B1](https://patents.google.com/patent/KR102567118B1/ko) | 전자메일을 사용하여 간편한 승인요청을 관리하는 시스템 및 그 동작방법 | 2023-03-13 | 2023-08-16 |

Inventor: **Young Oak Lee / 이영옥**

## Patent-based product foundation

The patented workflow covers an approval-management system that can:

- create an approval-request case from user input or an external-system API request;
- deliver approval requests through email;
- capture explicit **approve / pending / deny** responses;
- remind approvers when a request remains pending;
- use templates, approver information, and automation playbooks to structure requests;
- compose automation from reusable modules / unit operations;
- execute or trigger the selected automation only after the approval result allows it; and
- exchange approval results with an external system through APIs.

## Product direction

DataRelay Grant is planned as a reusable **human-approval layer between a requested action and its execution**.

It is intended to complement DataRelay products such as DataRelay Link and DataRelay Control, while also supporting integration with external systems that need a human authorization gate before an automated action proceeds.

> **Request → Human Approval → Controlled Execution**

## Status

**Coming Soon — pre-release product definition.**

This repository currently contains product foundation information only. Public implementation details, APIs, deployment guidance, and release artifacts will be added as the product is developed.

Public documentation source: [datarelay-labs/datarelay-grant-docs](https://github.com/datarelay-labs/datarelay-grant-docs)

---

Patent references are provided as product-background information. The official patent records and issued claims control the legal scope of the patents.

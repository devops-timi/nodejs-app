# nodejs-app — README

## Project purpose
This repository contains:

- A simple Node.js web application (node-app/) that serves a static HTML view and provides a small /api/info endpoint.
- Infrastructure-as-code (terraform/) to provision a single Ubuntu EC2 instance and security group on AWS.
- Ansible playbook (ansible/) to install Docker and configure the ubuntu user to run Docker without sudo.
- Dockerfile to containerize the Node.js app so it can be run locally or on the provisioned EC2 host.

The intended workflow: use Terraform to create the EC2 host, use Ansible to install Docker on the host, then run the Node.js app inside a Docker container (built locally and copied/pulled to the host or pulled from a registry).

## Repository layout

- .gitignore
- README.md (this file)
- terraform/
  - provider.tf
  - variables.tf
  - data.tf
  - main.tf
  - output.tf
- ansible/
  - node-playbook.yml
- node-app/
  - Dockerfile
  - package.json
  - src/
    - server.js
    - views/ (static view files)
- .github/ (CI/workflow directory exists)

## Files and exact contents

Note: these are the authoritative contents pulled from the repository.

## terraform/provider.tf

    terraform {
      required_providers {
        aws = {
          source  = "hashicorp/aws"
          version = "~> 5.92"
        }
      }
      required_version = ">= 1.4.0"
    }

    provider "aws" {
      region = var.region
    }
    
### Explanation:

- Declares the AWS provider requirement and Terraform version constraint.
- The AWS provider uses var.region.

## terraform/variables.tf

    variable "region" {
      type    = string
      default = "us-east-1"
    }

    variable "instance_type" {
      type    = string
      default = "t2.micro"
    }

    variable "local_key_name" { 
      type    = string
      description = "Name of keypair"
      default = "us-connect"
    }
    
### Explanation:

- region default: us-east-1
- instance_type default: t2.micro
- local_key_name default: us-connect — this must match a keypair name in your AWS account/region.

## terraform/data.tf

    data "aws_ami" "ubuntu" {
      most_recent = true
      owners      = ["099720109477"]  # Canonical

      filter {
        name   = "name"
        values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
      }

      filter {
        name   = "virtualization-type"
        values = ["hvm"]
      }
    }
    
### Explanation:

- Finds the most recent Canonical Ubuntu Jammy 22.04 AMI in the region.
  
## terraform/main.tf

    resource "aws_instance" "node_app_ec2" {
      ami                    = data.aws_ami.ubuntu.id
      instance_type          = var.instance_type
      key_name               = var.local_key_name

      vpc_security_group_ids = [aws_security_group.node_app_ec2_sg.id]

      tags = {
        Name = "node-app-cicd-instance"
      }
    }

    resource "aws_security_group" "node_app_ec2_sg" {
      name        = "node-app-sg"
      description = "Allow 22, 80, 443"

      ingress {
        from_port   = 22
        to_port     = 22
        protocol    = "tcp"
        cidr_blocks = ["0.0.0.0/0"]
      }

      ingress {
        from_port   = 80
        to_port     = 80
        protocol    = "tcp"
        cidr_blocks = ["0.0.0.0/0"]
      }

      ingress {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        cidr_blocks = ["0.0.0.0/0"]
      }

      egress {
        from_port   = 0
        to_port     = 0
        protocol    = "-1"
        cidr_blocks = ["0.0.0.0/0"]
      }

      egress {
        from_port   = 80
        to_port     = 80
        protocol    = "tcp"
        cidr_blocks = ["0.0.0.0/0"]
      }

      egress {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        cidr_blocks = ["0.0.0.0/0"]
      }
    }

### Explanation:

- aws_instance.node_app_ec2: creates a single EC2 instance with chosen AMI, instance_type, and key pair.
- aws_security_group.node_app_ec2_sg: opens inbound SSH (22), HTTP (80), HTTPS (443) from anywhere (0.0.0.0/0) and allows outbound traffic.

## terraform/output.tf

    output "public_ip" {
      value = aws_instance.node_app_ec2.public_ip
    }

### Explanation:

- Exposes the created EC2 instance public IP after terraform apply.

## ansible/node-playbook.yml

    ---
    - name: Install Docker and set Ubuntu Permission
      hosts: all
      become: yes

      tasks:

        - name: Update apt cache
          apt:
            update_cache: yes

        - name: Install Docker
          apt: 
            name: docker.io
            state: present

        - name: Start Docker Daemon
          service:
            name: docker
            state: started
            enabled: yes

        - name: Add Ubuntu User to Docker Group for Permission
          user:
            name: ubuntu
            groups: docker
            append: yes
            
### Explanation:

- Updates apt, installs docker.io package, ensures docker service is started and enabled, and adds the ubuntu user to the docker group so that the ubuntu user can run docker without sudo.

How to use:

- Prepare an inventory with the EC2 public IP (or pass the host directly).
- Provide the SSH private key for the EC2 keypair and use ansible-playbook:
- Example inventory entry: [node] 1.2.3.4 ansible_user=ubuntu ansible_host=1.2.3.4
- Run: ansible-playbook -i ansible/inventory.ini ansible/node-playbook.yml --private-key=~/.ssh/your-key.pem

## node-app/Dockerfile

    FROM node:18-alpine

    WORKDIR /app
    COPY package*.json ./
    RUN npm install --only=production
    COPY . .

    EXPOSE 3000
    CMD ["npm", "start"]

### Explanation:

- Uses node:18-alpine base image.
- Copies package*.json and installs only production dependencies.
- Copies the application code, exposes port 3000, and starts via npm start.

## node-app/package.json

    {
      "name": "my-node-app",
      "version": "1.0.0",
      "main": "src/server.js",
      "scripts": {
        "start": "node src/server.js"
      },
       "dependencies": {
         "dotenv": "^16.4.5",
         "express": "^4.18.2"
      }
    }

## Explanation:

- start script: node src/server.js
- dependencies: express for server, dotenv for environment variable loading.

## node-app/src/server.js

    require("dotenv").config();
    const express = require("express");
    const path = require("path");

    const app = express();

    const PORT = process.env.PORT || 3000;
    const APP_NAME = process.env.APP_NAME || "NodeJS App";

    // Serve static files
    app.use(express.static(path.join(__dirname, "views")));

    // Home route
    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "views", "index.html"));
    });

    // API route
    app.get("/api/info", (req, res) => {
      res.json({
        app: APP_NAME,
        status: "running",
        timestamp: new Date().toISOString()
      });
    });

    app.listen(PORT, () => {
      console.log(`${APP_NAME} started on port ${PORT}`);
    });

Behavior:

- Serves static files from src/views.
- GET / returns src/views/index.html.
- GET /api/info returns JSON with app name, status, and timestamp.
- Listens on PORT env var or 3000.

## .gitignore

    # Node.js
    node-app/node_modules/
    node-app/package-lock.json

    # If package.json should NOT be versioned (usually it SHOULD be)
    # node-app/package.json

    # Ansible
    ansible/inventory.ini

    # Terraform
    terraform/*.tfstate
    terraform/*.tfstate.*
    terraform/.terraform/
    terraform/.terraform.lock.hcl

### Explanation 

Ignores node_modules, package-lock.json, Ansible inventory, Terraform state and lock.

## How to run and deploy

Prerequisites:

- AWS credentials with permissions to create EC2 instances and security groups.
- Terraform installed (>= 1.4.0).
- Ansible installed.
- Docker installed locally if you plan to build images locally.
- An existing AWS EC2 key pair whose name matches the terraform variable local_key_name (default "us-connect") or pass another key name.

1. Provision infrastructure with Terraform

- Initialize: terraform init
- Plan (optionally override key name): terraform plan -var="local_key_name=your-key-name"
- Apply: terraform apply -var="local_key_name=your-key-name"
- After apply, note the public_ip output (terraform output public_ip).

Security note:

- The security group in this repo opens SSH to 0.0.0.0/0. For production, restrict SSH to your IP.

2. Configure the instance with Ansible
   
- Create ansible/inventory.ini (or use the ephemeral host inventory) that contains the instance public IP and ansible_user=ubuntu.
- Example inventory: [node] <PUBLIC_IP> ansible_user=ubuntu ansible_host=<PUBLIC_IP>
- Run: ansible-playbook -i ansible/inventory.ini ansible/node-playbook.yml --private-key=~/.ssh/your-key.pem

What this playbook does:

- Updates apt cache, installs docker.io, starts/enables docker service, and adds ubuntu user to docker group.

3. Build and run the Node.js Docker image Option A — Build locally and push to a registry, then pull on the instance

- Build: docker build -t YOUR_REPO/nodejs-app:latest node-app/
- Push to Docker Hub / ECR: docker push YOUR_REPO/nodejs-app:latest
- On the EC2 host: docker pull YOUR_REPO/nodejs-app:latest docker run -d -p 80:3000 --env-file node-app/.env --name nodejs-app YOUR_REPO/nodejs-app:latest

Option B — Build and run directly on the EC2 instance (requires git or copying source)

- Copy source to host (scp or git clone).
- On host: cd node-app docker build -t nodejs-app:latest . docker run -d -p 80:3000 --env-file .env --name nodejs-app nodejs-app:latest

Notes:

- The app listens on port 3000 internally; typical host mapping above forwards host port 80 to container port 3000.
- Ensure .env exists on the host if you rely on environment variables (PORT, APP_NAME, etc.).

4. Verify

- Visit http://<PUBLIC_IP>/ to see the index.html served by the app.
- Visit http://<PUBLIC_IP>/api/info to see the JSON status.
  
## Scripts / run commands summary

- Terraform:
    - terraform init
    - terraform plan 
    - terraform apply 
- Ansible:
    - ansible-playbook -i ansible/inventory.ini ansible/node-playbook.yml --private-key=~/.ssh/your-key.pem
- Docker:
    - Build: docker build -t nodejs-app:latest node-app/
    - Run (map host 80 to app port 3000): docker run -d -p 80:3000 --env-file node-app/.env --name nodejs-app nodejs-app:latest
- Node (local testing without Docker):
    - cd node-app
    - npm install
    - npm start

## Security & operational recommendations

- Use a secure remote Terraform state (S3 backend with locking) for team usage.
- Do not commit private keys or secrets; use the .gitignore included and a secrets store for production.

## Next steps & optional improvements

Add CI/CD workflows to build/push images and deploy to the instance automatically.
Harden the EC2 instance (SSH MFA, restricted security group, OS updates).
Add monitoring/log aggregation for the app and host.

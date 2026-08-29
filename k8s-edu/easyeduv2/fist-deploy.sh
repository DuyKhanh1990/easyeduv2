#!/bin/bash
set -e

NAMESPACE="production"
APP_NAME="easyeduv2"
K8S_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGOCD_APP="$(dirname "$K8S_DIR")/argocd-application/easyeduv2.yaml"

echo "=== First Deploy: $APP_NAME ==="

# 1. Đảm bảo namespace tồn tại
echo "[1/5] Checking namespace '$NAMESPACE'..."
kubectl get namespace "$NAMESPACE" > /dev/null 2>&1 || {
  echo "  Creating namespace '$NAMESPACE'..."
  kubectl create namespace "$NAMESPACE"
}
echo "  OK"

# 2. Apply toàn bộ resources qua kustomize
echo "[2/5] Applying Kubernetes resources (kustomize)..."
kubectl apply -k "$K8S_DIR"
echo "  OK"

# 3. Tạo ArgoCD Application (GitOps)
echo "[3/5] Creating ArgoCD Application..."
if kubectl get application "$APP_NAME" -n argocd > /dev/null 2>&1; then
  echo "  ArgoCD app '$APP_NAME' already exists, syncing..."
  argocd app sync "$APP_NAME" --force 2>/dev/null || \
    kubectl apply -f "$ARGOCD_APP"
else
  kubectl apply -f "$ARGOCD_APP"
  echo "  ArgoCD app '$APP_NAME' created"
fi

# 4. Chờ deployment ready
echo "[4/5] Waiting for deployment to be ready..."
kubectl rollout status deployment/"$APP_NAME" -n "$NAMESPACE" --timeout=120s
echo "  OK"

# 5. Kiểm tra trạng thái
echo "[5/5] Verifying deployment..."
echo ""
kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME"
echo ""
kubectl get svc -n "$NAMESPACE" "$APP_NAME"
echo ""
kubectl get ingress -n "$NAMESPACE" -l app="$APP_NAME"

echo ""
echo "=== Deploy completed successfully! ==="
echo "Service: https://easyeduv2.easyedu.vn"
